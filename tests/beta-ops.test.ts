import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

const { sessionCookieName } = await import("../src/lib/session");
const { tenantForToken } = await import("../src/lib/tenant");
const { reportError } = await import("../src/lib/error-reporting");
const { SUPPORT_EMAIL, SUPPORT_MAILTO } = await import("../src/lib/support");
const errorsPOST = (await import("../src/app/api/errors/route")).POST;
const sessionGET = (await import("../src/app/api/session/route")).GET;
const voicePOST = (await import("../src/app/api/voice/route")).POST;
const mcpPOST = (await import("../src/app/api/mcp/route")).POST;
const DisclosureBody = (await import("../src/components/dial/DisclosureSheet")).DisclosureBody;
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

const TOKEN = randomBytes(32).toString("hex");
const TENANT = tenantForToken(TOKEN);
const cookie = `${sessionCookieName()}=${TOKEN}`;

const req = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) =>
  new NextRequest(url, { method: init?.method, body: init?.body, headers: init?.headers });

describe("support reference", () => {
  test("/api/session needs a session and returns only the hash", async () => {
    expect((await sessionGET(req("https://x.test/api/session"))).status).toBe(401);
    const res = await sessionGET(req("https://x.test/api/session", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ reference: TENANT });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(res.headers.get("cache-control")).toContain("private");
    const other = await sessionGET(req("https://x.test/api/session", {
      headers: { cookie: `${sessionCookieName()}=${randomBytes(32).toString("hex")}` },
    }));
    expect((await other.json()).reference).not.toBe(TENANT);
    const forged = await sessionGET(req(`https://x.test/api/session?tenant=${TENANT}`));
    expect(forged.status).toBe(401);
  });
});

describe("error reporting", () => {
  const capture = () => {
    const lines: string[] = [];
    const orig = console.error;
    console.error = (m: unknown) => lines.push(String(m));
    return { lines, restore: () => { console.error = orig; } };
  };

  test("records only intended fields — no message, stack, query or cookies", () => {
    const c = capture();
    try {
      reportError({
        source: "server",
        method: "EVIL",
        routePath: "/api/crew/run?token=secret-cookie-value",
        digest: "not-a-digest",
      });
      reportError({ source: "server", method: "GET", routePath: "/api/memory", digest: "12345" });
      expect(c.lines).toHaveLength(2);
      const rec = JSON.parse(c.lines[0]);
      expect(rec.event).toBe("meridian.request_error");
      expect(rec.method).toBe("UNKNOWN");
      expect(rec).not.toHaveProperty("digest");
      expect(Object.keys(rec).sort()).toEqual(["event", "method", "route", "source", "time"]);
      const rec2 = JSON.parse(c.lines[1]);
      expect(rec2.digest).toBe("12345");
      expect(rec2.method).toBe("GET");
      expect(JSON.stringify(c.lines)).not.toContain("secret-cookie-value");
    } finally {
      c.restore();
    }
  });

  test("POST /api/errors: session + size + digest-only validation", async () => {
    expect((await errorsPOST(req("https://x.test/api/errors", {
      method: "POST", body: "{}", headers: { "content-type": "application/json" },
    }))).status).toBe(401);
    const ok = await errorsPOST(req("https://x.test/api/errors", {
      method: "POST", body: JSON.stringify({ digest: "98765" }),
      headers: { "content-type": "application/json", cookie, "x-forwarded-for": "10.4.4.4" },
    }));
    expect(ok.status).toBe(204);
    for (const bad of [
      JSON.stringify({ digest: "abc" }),
      JSON.stringify({ url: "https://evil", message: "x".repeat(50) }),
      "x".repeat(2000),
    ]) {
      const res = await errorsPOST(req("https://x.test/api/errors", {
        method: "POST", body: bad,
        headers: { "content-type": "application/json", cookie, "x-forwarded-for": "10.4.4.5" },
      }));
      expect([400, 413]).toContain(res.status);
    }
    let last: Response | null = null;
    for (let i = 0; i < 10; i++) {
      last = await errorsPOST(req("https://x.test/api/errors", {
        method: "POST", body: "{}",
        headers: { "content-type": "application/json", cookie, "x-forwarded-for": "10.4.4.6" },
      }));
    }
    expect(last!.status).toBe(204);
    expect((await errorsPOST(req("https://x.test/api/errors", {
      method: "POST", body: "{}",
      headers: { "content-type": "application/json", cookie, "x-forwarded-for": "10.4.4.6" },
    }))).status).toBe(429);
  });
});

describe("voice abuse guard", () => {
  test("POST needs a session and is capped per IP before provider work", async () => {
    const noAuth = await voicePOST(req("https://x.test/api/voice", {
      method: "POST", body: "{}", headers: { "content-type": "application/json" },
    }));
    expect(noAuth.status).toBe(401);
    const realFetch = globalThis.fetch;
    let fetched = 0;
    globalThis.fetch = (async () => { fetched++; return new Response("x", { status: 200 }); }) as unknown as typeof fetch;
    try {
      const ip = "10.8.8.8";
      let last: Response | null = null;
      for (let i = 0; i < 30; i++) {
        last = await voicePOST(req("https://x.test/api/voice", {
          method: "POST", body: JSON.stringify({ text: "hi" }),
          headers: { "content-type": "application/json", cookie, "x-forwarded-for": ip },
        }));
      }
      expect(last!.status).not.toBe(429);
      const before = fetched;
      const limited = await voicePOST(req("https://x.test/api/voice", {
        method: "POST", body: JSON.stringify({ text: "hi" }),
        headers: { "content-type": "application/json", cookie, "x-forwarded-for": ip },
      }));
      expect(limited.status).toBe(429);
      expect(fetched).toBe(before);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("MCP batch limiting", () => {
  const call = (body: unknown, ip = "10.5.5.5") =>
    mcpPOST(req("https://x.test/api/mcp", {
      method: "POST", body: JSON.stringify(body),
      headers: { "content-type": "application/json", cookie, "x-forwarded-for": ip },
    }));

  test("batches over 10 are rejected before dispatch", async () => {
    const batch = Array.from({ length: 11 }, (_, i) => ({ jsonrpc: "2.0", id: i, method: "ping" }));
    const res = await call(batch);
    expect(res.status).toBe(400);
  });

  test("batch weight is the sum of per-item cost", async () => {
    const ip = "10.5.5.6";
    const batch = [
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "plan_shift", arguments: {} } },
      { jsonrpc: "2.0", id: 2, method: "ping" },
    ];
    const res = await call(batch, ip);
    expect(res.status).toBe(200);
    let status = 200;
    let n = 0;
    while (status === 200 && n < 10) {
      status = (await call(batch.map((m) => ({ ...m, id: n++ })), ip)).status;
    }
    expect(status).toBe(429);
  });
});

describe("history clear copy", () => {
  test("no server-deletion promise; clear is browser-scoped and links privacy", () => {
    const src = readFileSync("src/app/history/page.tsx", "utf8");
    expect(src).toContain("Clear this browser’s data");
    expect(src).toContain("This browser’s data cleared");
    expect(src).toContain("server records");
    expect(src).toContain("/privacy");
    expect(src).not.toContain("Delete all my data");
    expect(src).not.toContain("All your data deleted");
  });
});

describe("disclosure + support", () => {
  test("wearable copy is honest about the real CSV upload and links privacy", () => {
    const html = renderToStaticMarkup(React.createElement(DisclosureBody));
    expect(html).toContain("/privacy");
    expect(html).toContain("CSV");
    expect(html).not.toContain("simulated");
  });
  test("support constant", () => {
    expect(SUPPORT_MAILTO).toBe(`mailto:${SUPPORT_EMAIL}`);
  });
});

describe("client error boundary reporting", () => {
  test("reportClientError sends {} for missing/non-numeric digest, validated digest otherwise", async () => {
    const { reportClientError } = await import("../src/app/error");
    const sent: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (_u: unknown, init?: { body?: string }) => {
      sent.push(init?.body ?? "");
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    try {
      reportClientError(undefined);
      reportClientError("not-a-digest-../../etc");
      reportClientError({ evil: true });
      reportClientError("1234567");
      expect(sent).toEqual(["{}", "{}", "{}", JSON.stringify({ digest: "1234567" })]);
      expect(sent.join("")).not.toContain("not-a-digest");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("boundary never renders raw message or a non-numeric digest", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const mod = await import("../src/app/error");
    const ErrorPage = mod.default;
    const React = await import("react");
    const evil = Object.assign(new TypeError("supersecret-stack-text"), { digest: "abc/../x" });
    let html = renderToStaticMarkup(React.createElement(ErrorPage, { error: evil, retry: () => {} }));
    expect(html).not.toContain("supersecret-stack-text");
    expect(html).not.toContain("abc/../x");
    expect(html).toContain("could not be loaded");
    const good = Object.assign(new Error("x"), { digest: "4242" });
    html = renderToStaticMarkup(React.createElement(ErrorPage, { error: good, retry: () => {} }));
    expect(html).toContain("4242");
  });
});

describe("instrumentation onRequestError", () => {
  test("never throws and records only intended fields", async () => {
    const { onRequestError } = await import("../src/instrumentation");
    const lines: string[] = [];
    const orig = console.error;
    console.error = (m: unknown) => lines.push(String(m));
    try {
      const ctx = { routePath: "/api/crew/run", routerKind: "App Router", routeType: "route", renderSource: "app", revalidateReason: undefined } as never;
      for (const err of [null, undefined, "boom", { digest: "abc/../secrets" }, new TypeError("secret-key-123")]) {
        await onRequestError(err as never, { method: "GET", path: "/api/crew/run?token=x", headers: {} } as never, ctx);
      }
      expect(lines).toHaveLength(5);
      for (const l of lines) {
        const rec = JSON.parse(l);
        expect(rec.event).toBe("meridian.request_error");
        expect(rec.route).toBe("/api/crew/run");
        expect(rec).not.toHaveProperty("digest");
        expect(l).not.toContain("secret-key-123");
        expect(l).not.toContain("token=x");
      }
      const err2 = Object.assign(new Error("x"), { digest: "4242" });
      await onRequestError(err2, { method: "POST", path: "/x", headers: {} } as never, ctx);
      expect(JSON.parse(lines[5]).digest).toBe("4242");
    } finally {
      console.error = orig;
    }
  });
});

describe("crew run error reporting", () => {
  test("a failing crew emits generic SSE copy + structured log without the error text (subprocess)", () => {
    const script = `
      const { mock } = await import("bun:test");
      mock.module("./src/agents/runtime.ts", () => ({
        runCrew: () => (async function* () { throw new Error("uplink leaked ANTHROPIC_API_KEY sk-ant-secret-99"); })(),
      }));
      const lines = [];
      const orig = console.error;
      console.error = (m) => lines.push(String(m));
      const { GET } = await import("./src/app/api/crew/run/route.ts");
      const { sessionCookieName } = await import("./src/lib/session.ts");
      const { NextRequest } = await import("next/server");
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
      const res = await GET(new NextRequest("https://x.test/api/crew/run?origin=SFO&dest=HND&date=2026-11-06", {
        headers: { cookie: sessionCookieName() + "=" + token, "x-forwarded-for": "10.3.3.3" },
      }));
      const text = await res.text();
      const { crewRun } = await import("./src/lib/crew-runs.ts");
      const { rmSync } = await import("node:fs");
      const path = await import("node:path");
      const reg = globalThis.__meridianCrewRuns;
      for (const id of reg ? reg.keys() : []) rmSync(path.join(process.cwd(), "artifacts", "crew-runs", id + ".jsonl"), { force: true });
      console.error = orig;
      if (text.includes("sk-ant-secret-99") || text.includes("ANTHROPIC")) throw new Error("SSE leaked error text: " + text);
      if (!text.includes("The crew could not complete this plan")) throw new Error("no generic error: " + text);
      if (!text.includes('"done"')) throw new Error("no done event");
      const rec = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((r) => r && r.event === "meridian.request_error");
      if (!rec) throw new Error("no structured log");
      if (JSON.stringify(rec).includes("sk-ant-secret-99")) throw new Error("log leaked");
      if (rec.source !== "crew" || rec.route !== "/api/crew/run" || rec.method !== "GET") throw new Error("bad record " + JSON.stringify(rec));
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
