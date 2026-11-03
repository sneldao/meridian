import { describe, expect, test, afterAll } from "bun:test";
import { randomBytes } from "node:crypto";
import { rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";

const { middleware } = await import("../src/middleware");
const { sessionCookieName } = await import("../src/lib/session");
const { tenantOf, tenantForToken } = await import("../src/lib/tenant");
const { crewRun, startCrewRun, appendCrewEvent } = await import("../src/lib/crew-runs");
const { requestCalendarApproval, pendingCalendarApproval } = await import("../src/lib/calendar-approvals");
const { requestCrewQuestion, pendingCrewQuestion, resolveCrewQuestion } = await import("../src/lib/crew-questions");
const { saveSharedPlan, loadSharedPlan, recordShareRecipient } = await import("../src/lib/share");
const { googleCalendarEnabled, patchGoogleEvent } = await import("../src/tools/calendar-google");
const { paymentsEnabled, paymentsConfig } = await import("../src/lib/payments");
const { paymentsConfigured } = await import("../src/lib/escrow");
const { dispatch } = await import("../src/mcp/server");
const { artifactPath } = await import("../src/lib/artifacts");

const crewRunGET = (await import("../src/app/api/crew/run/route")).GET;
const crewRunPOST = (await import("../src/app/api/crew/run/route")).POST;
const approvalsPOST = (await import("../src/app/api/crew/approvals/route")).POST;
const answersPOST = (await import("../src/app/api/crew/answers/route")).POST;
const memoryGET = (await import("../src/app/api/memory/route")).GET;
const checkinGET = (await import("../src/app/api/crew/checkin/route")).GET;
const wearablePOST = (await import("../src/app/api/wearable/route")).POST;
const tripGET = (await import("../src/app/api/trip/route")).GET;
const attestPOST = (await import("../src/app/api/payments/attest/route")).POST;
const persistenceRoutePOST = (await import("../src/app/api/persistence/runs/route")).POST;

const TOKEN_A = randomBytes(32).toString("hex");
const TOKEN_B = randomBytes(32).toString("hex");
const TENANT_A = tenantForToken(TOKEN_A);
const TENANT_B = tenantForToken(TOKEN_B);

const cookie = (token: string) => `${sessionCookieName()}=${token}`;
const req = (url: string, init?: { cookie?: string; method?: string; body?: string; headers?: Record<string, string> }) =>
  new NextRequest(url, {
    method: init?.method,
    body: init?.body,
    headers: { ...(init?.headers ?? {}), ...(init?.cookie ? { cookie: init.cookie } : {}) },
  });

const artifacts = (...parts: string[]) => path.join(process.cwd(), "artifacts", ...parts);
const runFile = (id: string) => artifacts("crew-runs", `${id}.jsonl`);
const cleanup: string[] = [];
const ownRun = (id: string, tenant: string) => {
  startCrewRun(id, tenant);
  cleanup.push(runFile(id));
};
afterAll(() => {
  for (const f of cleanup) rmSync(f, { force: true });
});

describe("session identity", () => {
  test("tenant derives from the 64-hex session cookie as a sha256 hash", () => {
    const r = req("https://x.test/api/memory", { cookie: cookie(TOKEN_A) });
    expect(tenantOf(r)).toBe(TENANT_A);
    expect(TENANT_A).not.toBe(TOKEN_A);
    expect(TENANT_A).toMatch(/^[0-9a-f]{48}$/);
  });

  test("query ?tenant= and x-meridian-tid never grant an identity", () => {
    const r = req("https://x.test/api/memory?tenant=victim", {
      headers: { "x-meridian-tid": "victim" },
    });
    expect(tenantOf(r)).toBeUndefined();
    const withCookie = req("https://x.test/api/memory?tenant=victim", {
      cookie: cookie(TOKEN_A),
      headers: { "x-meridian-tid": "victim" },
    });
    expect(tenantOf(withCookie)).toBe(TENANT_A);
  });

  test("malformed or foreign-cookie sessions yield no tenant", () => {
    for (const c of ["", `${sessionCookieName()}=short`, `${sessionCookieName()}=${"g".repeat(64)}`, `other=${TOKEN_A}`]) {
      const r = req("https://x.test/api/memory", { headers: { cookie: c } });
      expect(tenantOf(r)).toBeUndefined();
    }
  });
});

describe("middleware", () => {
  test("a first visit to an app page mints and mirrors the session cookie", () => {
    const res = middleware(new NextRequest("http://localhost:3000/crew"));
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${sessionCookieName()}=`);
    expect(setCookie).toContain("HttpOnly");
    const token = setCookie.match(new RegExp(`${sessionCookieName()}=([0-9a-f]{64})`))?.[1];
    expect(token).toBeTruthy();
    const mirrored = res.headers.get("x-middleware-request-cookie") ?? "";
    expect(mirrored).toContain(`${sessionCookieName()}=${token}`);
  });

  test("the first API call carries the minted token downstream — one identity, not many", () => {
    const res = middleware(new NextRequest("http://localhost:3000/api/memory"));
    const mirrored = res.headers.get("x-middleware-request-cookie") ?? "";
    const token = mirrored.match(new RegExp(`${sessionCookieName()}=([0-9a-f]{64})`))?.[1];
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(res.headers.get("set-cookie")).toContain(`${sessionCookieName()}=${token}`);
  });

  test("a valid existing cookie is reused, not reminted", () => {
    const res = middleware(new NextRequest("http://localhost:3000/api/memory", {
      headers: { cookie: cookie(TOKEN_A) },
    }));
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("x-middleware-request-cookie")).toContain(`${sessionCookieName()}=${TOKEN_A}`);
  });

  test("the forged legacy header is stripped downstream", () => {
    const res = middleware(new NextRequest("http://localhost:3000/api/memory", {
      headers: { "x-meridian-tid": "victim", cookie: cookie(TOKEN_A) },
    }));
    expect(res.headers.get("x-middleware-request-x-meridian-tid")).toBeNull();
  });

  test("cross-site API reads and cross-origin writes are refused", () => {
    const crossSite = middleware(new NextRequest("http://localhost:3000/api/memory", {
      headers: { "sec-fetch-site": "cross-site" },
    }));
    expect(crossSite.status).toBe(403);
    const foreignWrite = middleware(new NextRequest("http://localhost:3000/api/crew/checkin", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    }));
    expect(foreignWrite.status).toBe(403);
    const sameOrigin = middleware(new NextRequest("http://localhost:3000/api/crew/checkin", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }));
    expect(sameOrigin.status).toBe(200);
    const cli = middleware(new NextRequest("http://localhost:3000/api/crew/checkin", { method: "POST" }));
    expect(cli.status).toBe(200);
  });

  test("a POST from the public origin is not foreign behind a proxy", () => {
    // Behind Cloudflare→Render, req.nextUrl.origin is the internal host; the
    // browser's Origin is the public domain. That pair must be allowed.
    const r = middleware(new NextRequest("https://internal.render.app/api/errors", {
      method: "POST",
      headers: { origin: "https://meridian.trustfall.xyz" },
    }));
    expect(r.status).toBe(200);
  });

  test("API answers are marked private,no-store", () => {
    const res = middleware(new NextRequest("http://localhost:3000/api/memory"));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("session-gated personal routes", () => {
  test("missing or forged sessions are 401 on personal reads", async () => {
    for (const r of [
      req("https://x.test/api/memory"),
      req("https://x.test/api/memory?tenant=victim"),
      req("https://x.test/api/memory", { headers: { cookie: `${sessionCookieName()}=${"z".repeat(10)}` } }),
    ]) {
      expect((await memoryGET(r)).status).toBe(401);
    }
    expect((await checkinGET(req("https://x.test/api/crew/checkin"))).status).toBe(401);
    const ok = await memoryGET(req("https://x.test/api/memory", { cookie: cookie(TOKEN_A) }));
    expect(ok.status).toBe(200);
  });
});

describe("crew run ownership", () => {
  test("startCrewRun records the owner and reports created", () => {
    const runId = `secrun-${crypto.randomUUID()}`;
    const a = startCrewRun(runId, TENANT_A);
    cleanup.push(runFile(runId));
    expect(a.created).toBe(true);
    expect(a.run.ownerTenant).toBe(TENANT_A);
    const again = startCrewRun(runId, TENANT_B);
    expect(again.created).toBe(false);
    expect(again.run.ownerTenant).toBe(TENANT_A);
  });

  test("the owner survives registry eviction through the persisted meta line", () => {
    const id = `secrun-${crypto.randomUUID()}`;
    ownRun(id, TENANT_A);
    appendCrewEvent(id, { type: "done" });
    (globalThis as { __meridianCrewRuns?: Map<string, unknown> }).__meridianCrewRuns!.delete(id);
    expect(crewRun(id)?.ownerTenant).toBe(TENANT_A);
  });

  test("a second tenant cannot resume, stream or cancel someone else's run", async () => {
    const id = `secrun-${crypto.randomUUID()}`;
    ownRun(id, TENANT_A);
    const resume = await crewRunGET(req(`https://x.test/api/crew/run?runId=${id}&resume=1`, { cookie: cookie(TOKEN_B) }));
    expect(resume.status).toBe(404);
    const forged = await crewRunGET(req(`https://x.test/api/crew/run?runId=${id}&resume=1&tenant=${TENANT_A}`));
    expect([401, 404]).toContain(forged.status);
    const cancelB = await crewRunPOST(req("https://x.test/api/crew/run", {
      method: "POST", body: JSON.stringify({ runId: id }), cookie: cookie(TOKEN_B),
      headers: { "content-type": "application/json" },
    }));
    expect(cancelB.status).toBe(404);
    expect(crewRun(id)?.cancelled).toBeFalsy();
    const cancelA = await crewRunPOST(req("https://x.test/api/crew/run", {
      method: "POST", body: JSON.stringify({ runId: id }), cookie: cookie(TOKEN_A),
      headers: { "content-type": "application/json" },
    }));
    expect(cancelA.status).toBe(200);
    expect((await cancelA.json()).ok).toBe(true);
  });

  test("ownerless legacy runs cannot be resumed or cancelled over HTTP", async () => {
    const id = `secrun-${crypto.randomUUID()}`;
    startCrewRun(id);
    cleanup.push(runFile(id));
    const res = await crewRunGET(req(`https://x.test/api/crew/run?runId=${id}&resume=1`, { cookie: cookie(TOKEN_A) }));
    expect(res.status).toBe(404);
    const cancel = await crewRunPOST(req("https://x.test/api/crew/run", {
      method: "POST", body: JSON.stringify({ runId: id }), cookie: cookie(TOKEN_A),
      headers: { "content-type": "application/json" },
    }));
    expect(cancel.status).toBe(404);
  });

  test("malformed runIds are 400 before the registry; missing sessions are 401 first", async () => {
    expect((await crewRunGET(req("https://x.test/api/crew/run?runId=..&resume=1", { cookie: cookie(TOKEN_A) }))).status).toBe(400);
    for (const bad of [{ runId: { nested: "x" } }, { runId: 123 }, {}]) {
      const res = await crewRunPOST(req("https://x.test/api/crew/run", {
        method: "POST", body: JSON.stringify(bad), cookie: cookie(TOKEN_A),
        headers: { "content-type": "application/json" },
      }));
      expect(res.status).toBe(400);
    }
    const res = await crewRunGET(req(`https://x.test/api/crew/run?runId=secrun-${crypto.randomUUID()}&resume=1`));
    expect(res.status).toBe(401);
  });
});

describe("pending approvals and answers are owner-gated", () => {
  const payload = {
    trip: { origin: { code: "LHR" }, destination: { code: "HND" } },
    calendar: [],
    lockedDays: [],
    moves: [],
  };

  test("a different tenant cannot resolve a calendar approval; the owner can", async () => {
    const runId = `secrun-${crypto.randomUUID()}`;
    ownRun(runId, TENANT_A);
    const req0 = requestCalendarApproval({ ...payload, runId } as never);
    const denied = await approvalsPOST(req("https://x.test/api/crew/approvals", {
      method: "POST", cookie: cookie(TOKEN_B),
      body: JSON.stringify({ approvalId: req0.approvalId, approve: false }),
      headers: { "content-type": "application/json" },
    }));
    expect(denied.status).toBe(404);
    expect(pendingCalendarApproval(req0.approvalId)).not.toBeNull();
    const allowed = await approvalsPOST(req("https://x.test/api/crew/approvals", {
      method: "POST", cookie: cookie(TOKEN_A),
      body: JSON.stringify({ approvalId: req0.approvalId, approve: false }),
      headers: { "content-type": "application/json" },
    }));
    expect(allowed.status).toBe(200);
    expect((await allowed.json()).result.status).toBe("rejected");
  });

  test("a different tenant cannot answer a crew question; the owner can", async () => {
    const runId = `secrun-${crypto.randomUUID()}`;
    ownRun(runId, TENANT_A);
    const q = requestCrewQuestion({ runId, options: [{ id: "keep", label: "Keep" }, { id: "earlier", label: "Earlier" }] });
    const denied = await answersPOST(req("https://x.test/api/crew/answers", {
      method: "POST", cookie: cookie(TOKEN_B),
      body: JSON.stringify({ questionId: q.questionId, optionId: "earlier" }),
      headers: { "content-type": "application/json" },
    }));
    expect(denied.status).toBe(404);
    expect(pendingCrewQuestion(q.questionId)).not.toBeNull();
    const allowed = await answersPOST(req("https://x.test/api/crew/answers", {
      method: "POST", cookie: cookie(TOKEN_A),
      body: JSON.stringify({ questionId: q.questionId, optionId: "earlier" }),
      headers: { "content-type": "application/json" },
    }));
    expect(allowed.status).toBe(200);
    await expect(q.result).resolves.toEqual({ optionId: "earlier", skipped: false });
  });

  test("questions without a run linkage are unanswerable over HTTP", async () => {
    const q = requestCrewQuestion({ options: [{ id: "keep", label: "Keep" }] });
    const res = await answersPOST(req("https://x.test/api/crew/answers", {
      method: "POST", cookie: cookie(TOKEN_A),
      body: JSON.stringify({ questionId: q.questionId, optionId: "keep" }),
      headers: { "content-type": "application/json" },
    }));
    expect(res.status).toBe(404);
    expect(pendingCrewQuestion(q.questionId)).not.toBeNull();
    expect(resolveCrewQuestion(q.questionId, "keep")).toEqual({ optionId: "keep", skipped: false });
  });

  test("non-string ids are rejected before any store access", async () => {
    for (const [route, body] of [
      [approvalsPOST, { approvalId: { x: 1 }, approve: true }],
      [answersPOST, { questionId: 7, optionId: "keep" }],
    ] as const) {
      const res = await route(req("https://x.test/api/crew/x", {
        method: "POST", cookie: cookie(TOKEN_A),
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }));
      expect(res.status).toBe(400);
    }
  });
});

describe("share ids", () => {
  test("crafted ids never reach the filesystem or Supabase", async () => {
    for (const bad of ["../shift-plan", "..%2Fshift-plan", "/etc/passwd", "a/b", "x".repeat(200), "not-hex!!", "", "ABCdef1234"]) {
      expect(await loadSharedPlan(bad)).toBeNull();
      expect(await recordShareRecipient(bad)).toBe(false);
    }
  });

  test("new shares mint 32-hex ids that round-trip", async () => {
    const id = await saveSharedPlan({ briefing: { summary: "s", days: [] }, trip: null });
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    const back = await loadSharedPlan(id);
    expect(back?.briefing).toEqual({ summary: "s", days: [] });
    cleanup.push(artifacts("share", `${id}.json`));
  });

  test("legacy 10-hex ids still read", async () => {
    const id = randomBytes(5).toString("hex");
    mkdirSync(artifacts("share"), { recursive: true });
    writeFileSync(artifacts("share", `${id}.json`), JSON.stringify({ briefing: { summary: "legacy", days: [] } }), { flag: "wx" });
    cleanup.push(artifacts("share", `${id}.json`));
    expect((await loadSharedPlan(id))?.briefing).toEqual({ summary: "legacy", days: [] });
  });
});

describe("beta-disabled integrations", () => {
  test("google calendar is off even with keys", async () => {
    const prev = process.env.COMPOSIO_API_KEY;
    process.env.COMPOSIO_API_KEY = "ck";
    try {
      expect(googleCalendarEnabled()).toBe(false);
      await expect(
        patchGoogleEvent(
          { id: "e1", title: "t", dayIndex: 0, startMin: 0, endMin: 30, movable: true },
          { eventId: "e1", title: "t", from: { dayIndex: 0, startMin: 0, endMin: 30 }, to: { dayIndex: 0, startMin: 60, endMin: 90 }, reason: "" },
          { days: [{ date: "2026-10-18" }] } as never,
        ),
      ).rejects.toThrow("disabled");
    } finally {
      if (prev === undefined) delete process.env.COMPOSIO_API_KEY; else process.env.COMPOSIO_API_KEY = prev;
    }
  });

  test("payments cannot be enabled by env, over HTTP or on the client flag", async () => {
    const keys = ["ATTESTER_PRIVATE_KEY", "TRIP_ESCROW_ADDRESS", "ARC_RPC", "NEXT_PUBLIC_PAYMENTS_ENABLED", "NEXT_PUBLIC_TRIP_ESCROW_ADDRESS"];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    process.env.ATTESTER_PRIVATE_KEY = `0x${"1".repeat(64)}`;
    process.env.TRIP_ESCROW_ADDRESS = `0x${"2".repeat(40)}`;
    process.env.ARC_RPC = "https://rpc.testnet.arc.io";
    process.env.NEXT_PUBLIC_PAYMENTS_ENABLED = "1";
    process.env.NEXT_PUBLIC_TRIP_ESCROW_ADDRESS = `0x${"2".repeat(40)}`;
    try {
      expect(paymentsEnabled()).toBe(false);
      expect(paymentsConfigured()).toBe(false);
      expect(paymentsConfig()).not.toBeNull();
      const res = await attestPOST(req("https://x.test/api/payments/attest", {
        method: "POST",
        body: JSON.stringify({ runId: "r", wallet: `0x${"3".repeat(40)}`, tripId: `0x${"4".repeat(64)}` }),
        headers: { "content-type": "application/json" },
      }));
      expect(res.status).toBe(503);
    } finally {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
      }
    }
  });
});

describe("MCP tenant scoping", () => {
  const call = (name: string, args: unknown = {}, tenant?: string) =>
    dispatch({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, tenant) as Promise<{ result?: { isError?: boolean; structuredContent?: unknown } }>;

  test("personal tools refuse without a tenant; public tools still answer", async () => {
    for (const name of ["crew_memory", "record_check_in", "recall_findings", "latest_plan", "plan_shift"]) {
      const r = await call(name, name === "record_check_in" ? { text: "x" } : name === "recall_findings" ? { target: "x" } : { origin: "LHR", dest: "HND", date: "2026-10-18" });
      expect(r?.result?.isError).toBe(true);
    }
    const pub = await call("search_web", { query: "x" });
    expect(pub?.result?.isError).toBeUndefined();
  });

  test("personal tools run under the caller's tenant only", async () => {
    const r = await call("crew_memory", {}, TENANT_A);
    expect(r?.result?.isError).toBeUndefined();
    const plan = await call("latest_plan", {}, TENANT_A);
    expect(plan?.result?.isError).toBeUndefined();
    expect(artifactPath("shift-plan.json", TENANT_A)).not.toBe(artifactPath("shift-plan.json", TENANT_B));
    expect(artifactPath("shift-plan.json")).toContain("shift-plan.json");
  });
});

describe("persistence payload validation", () => {
  const post = (body: string, ip = "10.9.9.9") =>
    persistenceRoutePOST(req("https://x.test/api/persistence/runs", {
      method: "POST", body, cookie: cookie(TOKEN_A),
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
    }));

  test("missing session is 401", async () => {
    const res = await persistenceRoutePOST(req("https://x.test/api/persistence/runs", {
      method: "POST", body: "{}", headers: { "content-type": "application/json" },
    }));
    expect(res.status).toBe(401);
  });

  test("schema rejects bad savedAt, empty codes, bad direction — before any insert", async () => {
    const savedSb = { SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY };
    process.env.SUPABASE_URL = "https://sb.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sk";
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("[]", { status: 201, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    try {
      for (const bad of [
        JSON.stringify({ savedAt: "1", score: 1, summary: "x" }),
        JSON.stringify({ savedAt: "2026-01-01T00:00:00Z", score: "x", summary: "x" }),
        JSON.stringify({ savedAt: "2026-01-01T00:00:00Z", score: 1, summary: "x", trip: { origin: { code: "" }, destination: { code: "HND" }, requiredShiftMin: -480, direction: "east" } }),
        JSON.stringify({ savedAt: "2026-01-01T00:00:00Z", score: 1, summary: "x", trip: { origin: { code: "LHR" }, destination: { code: "HND" }, requiredShiftMin: -480, direction: "sideways" } }),
        "not json",
      ]) {
        expect((await post(bad)).status).toBe(400);
      }
      expect((await post(JSON.stringify({ savedAt: "1", score: 1, summary: "x" }))).status).toBe(400);
    } finally {
      globalThis.fetch = realFetch;
      for (const k of Object.keys(savedSb) as (keyof typeof savedSb)[]) {
        if (savedSb[k] === undefined) delete process.env[k]; else process.env[k] = savedSb[k];
      }
    }
  });
});

describe("wearable baseline scoping", () => {
  const CSV = [
    "date,sleep,wake,bedtime",
    "2026-10-14,7:24,06:30,23:41",
    "2026-10-15,6:58,06:10,23:12",
    "2026-10-16,7:40,06:45,23:05",
  ].join("\n");

  test("an uploaded baseline serves its owner as garmin and nobody else", async () => {
    const file = artifacts(`wearable-${TENANT_A.replace(/[^a-z0-9_-]/gi, "")}.json`);
    cleanup.push(file);
    const up = await wearablePOST(req("https://x.test/api/wearable", {
      method: "POST", body: CSV, cookie: cookie(TOKEN_A),
      headers: { "content-type": "text/csv" },
    }));
    expect(up.status).toBe(200);
    const tripA = await tripGET(req("https://x.test/api/trip?origin=SFO&dest=HND&date=2026-11-06", { cookie: cookie(TOKEN_A) }));
    expect((await tripA.json()).baselineSource).toBe("garmin");
    const tripB = await tripGET(req("https://x.test/api/trip?origin=SFO&dest=HND&date=2026-11-06", { cookie: cookie(TOKEN_B) }));
    expect((await tripB.json()).baselineSource).toBe("fixture");
  });

  test("the crew route passes the owner's baseline into runCrew options (isolated subprocess)", () => {
    const script = `
      import { mock } from "bun:test";
      const TENANT_A = ${JSON.stringify(TENANT_A)};
      const baselineA = { wearer: "A", source: "test", avgBedtimeMin: 100, avgWakeMin: 500, avgSleepMin: 400, hrvMs: 40, hrvTrend: "stable", restingHr: 55, chronotype: "neutral", nights: [{ date: "d", bedtimeMin: 1, wakeMin: 2, sleepMin: 3, hrvMs: 4 }] };
      let captured;
      mock.module("./src/agents/runtime.ts", () => ({
        runCrew: (opts) => { captured = opts; return (async function* () { yield { type: "done" }; })(); },
      }));
      mock.module("./src/tools/wearable.ts", () => ({
        loadWearableBaseline: async (t) => (t === TENANT_A ? baselineA : null),
        saveWearableBaseline: async () => {},
        getAdherenceProfile: () => ({}),
      }));
      const { GET } = await import("./src/app/api/crew/run/route.ts");
      const { sessionCookieName } = await import("./src/lib/session.ts");
      const { tenantForToken } = await import("./src/lib/tenant.ts");
      const { NextRequest } = await import("next/server");
      const tokenA = ${JSON.stringify(TOKEN_A)};
      const tokenB = ${JSON.stringify(TOKEN_B)};
      const reqFor = (tok) => new NextRequest("https://x.test/api/crew/run?origin=SFO&dest=HND&date=2026-11-06", {
        headers: { cookie: sessionCookieName() + "=" + tok, "x-forwarded-for": "10.7.7.7" },
      });
      const runIds = new Set();
      try {
        const resA = await GET(reqFor(tokenA));
        if (resA.status !== 200) throw new Error("A status " + resA.status);
        await resA.body?.cancel();
        runIds.add(captured?.runId);
        if (captured?.baseline !== baselineA) throw new Error("A baseline not passed");
        if (captured?.baselineKind !== "garmin") throw new Error("A kind " + captured?.baselineKind);
        if (captured?.tenant !== TENANT_A) throw new Error("A tenant mismatch");
        captured = undefined;
        const resB = await GET(new NextRequest("https://x.test/api/crew/run?origin=SFO&dest=HND&date=2026-11-06&tenant=" + TENANT_A, {
          headers: { cookie: sessionCookieName() + "=" + tokenB, "x-forwarded-for": "10.7.7.8" },
        }));
        await resB.body?.cancel();
        runIds.add(captured?.runId);
        if (captured?.baseline === baselineA) throw new Error("B leaked A baseline");
        if (captured?.baselineKind === "garmin") throw new Error("B claimed garmin");
        if (captured?.tenant === TENANT_A) throw new Error("forged tenant query took effect");
      } finally {
        const { rmSync } = await import("node:fs");
        const path = await import("node:path");
        for (const id of runIds) if (id) rmSync(path.join(process.cwd(), "artifacts", "crew-runs", id + ".jsonl"), { force: true });
      }
      console.log("ok");
    `;
    const out = Bun.spawnSync({
      cmd: ["bun", "-e", script],
      cwd: process.cwd(),
      env: { ...process.env, AGENT_PROVIDER: "replay", CALENDAR_BACKEND: "fixture" },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(out.stderr.toString()).not.toContain("Error");
    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain("ok");
  });
});

describe("supabase ownership (isolated subprocess)", () => {
  const script = `
    process.env.SUPABASE_URL = "https://sb.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sk";
    const calls = [];
    globalThis.fetch = (async (url, init) => {
      const u = String(url);
      calls.push({ u, body: init?.body });
      if (u.includes("meridian_events") && init?.method === "POST") return new Response("[]", { status: 201, headers: { "content-type": "application/json" } });
      const ALL = [
        { id: "rA", payload: { savedAt: "2026-01-01T00:00:00Z", score: 8, summary: "a", ownerTenant: "tenantA" }, created_at: "2026-01-01T00:00:00Z" },
        { id: "rB", payload: { savedAt: "2026-01-02T00:00:00Z", score: 7, summary: "b", ownerTenant: "tenantB" }, created_at: "2026-01-02T00:00:00Z" },
        { id: "rOld", payload: { savedAt: "2026-01-03T00:00:00Z", score: 6, summary: "unowned legacy" }, created_at: "2026-01-03T00:00:00Z" },
      ];
      const params = new URL(u).searchParams;
      const ownerFilter = params.get("payload->>ownerTenant") ?? "";
      const m = ownerFilter.match(/^eq\.(.*)$/);
      const rows = params.get("kind") === "eq.run" && m ? ALL.filter((r) => r.payload.ownerTenant === m[1]) : ALL;
      return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
    });
    const sb = await import("./src/tools/supabase.ts");
    if (await sb.persistRun({ a: 1 })) throw new Error("tenantless write persisted");
    if (await sb.persistCheckIn({ b: 2 })) throw new Error("tenantless checkin persisted");
    if ((await sb.listRuns(5)).length !== 0) throw new Error("tenantless read returned rows");
    if (calls.length) throw new Error("storage touched without tenant");
    const runBody = {
      savedAt: "2026-01-01T00:00:00Z", score: 7.2, summary: "4 days locked", ownerTenant: "forged",
      trip: { origin: { code: "LHR", name: "London" }, destination: { code: "HND", name: "Tokyo" }, requiredShiftMin: -480, direction: "east", departureDayIndex: 3, days: [{ dayIndex: 2, label: "D-1", date: "2026-11-05" }] },
      days: [{ label: "D-1", shiftMin: -90 }],
    };
    if (!(await sb.persistRun(runBody, "tenantA"))) throw new Error("insert failed");
    const insert = JSON.parse(calls.find((c) => c.body)?.body ?? "{}");
    if (insert.payload.ownerTenant !== "tenantA") throw new Error("ownerTenant not overwritten: " + insert.payload.ownerTenant);
    if (insert.payload.trip.departureDayIndex !== 3 || insert.payload.trip.days?.[0]?.date !== "2026-11-05" || insert.payload.trip.origin.name !== "London") throw new Error("day fields lost: " + JSON.stringify(insert.payload.trip));
    const runsA = await sb.listRuns(5, "tenantA");
    const runsB = await sb.listRuns(5, "tenantB");
    if (runsA.length !== 1 || runsA[0]?.ownerTenant !== "tenantA" || runsA[0]?.id !== "rA") throw new Error("A rows wrong: " + JSON.stringify(runsA));
    if (runsB.length !== 1 || runsB[0]?.ownerTenant !== "tenantB" || runsB[0]?.id !== "rB") throw new Error("B rows wrong");
    if (JSON.stringify(runsA).includes("unowned") || JSON.stringify(runsB).includes("unowned")) throw new Error("unowned row leaked");
    const qs = calls.map((c) => c.u).find((u) => u.includes("ownerTenant"));
    if (!qs || !qs.includes("kind=eq.run")) throw new Error("owner filter query missing");
    console.log("ok");
  `;

  test("A sees only A, B only B, unowned excluded, forgery overwritten", () => {
    const out = Bun.spawnSync({
      cmd: ["bun", "-e", script],
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(out.stderr.toString()).not.toContain("Error");
    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain("ok");
  });
});

describe("memory isolation", () => {
  test("a check-in for one tenant never appears in another's memory", async () => {
    const { loadMemory, recordCheckIn } = await import("../src/domain/memory");
    const t1 = randomBytes(24).toString("hex");
    const t2 = randomBytes(24).toString("hex");
    cleanup.push(artifacts(`crew-memory-${t1}.json`), artifacts(`crew-memory-${t2}.json`));
    await recordCheckIn({ id: "c1", dayIndex: 0, kind: "sleep_window", status: "done", text: "t1 only", at: Date.now() } as never, t1);
    const mem2 = await loadMemory(t2);
    expect(mem2.checkIns).toHaveLength(0);
    await recordCheckIn({ id: "c2", dayIndex: 0, kind: "sleep_window", status: "done", text: "t2 only", at: Date.now() } as never, t2);
    expect((await loadMemory(t2)).checkIns.map((c) => c.text)).toEqual(["t2 only"]);
    expect((await loadMemory(t1)).checkIns.map((c) => c.text)).toEqual(["t1 only"]);
  });
});
