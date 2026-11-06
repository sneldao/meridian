import { describe, expect, test } from "bun:test";
import { withStubbedGlobal } from "./stub-global";
import { memoryPlanStore } from "../src/lib/plan-store";
import { planVersion } from "../src/domain/plan-edit";
import { buildDemoScenario } from "../src/domain/demo-scenarios";

const demo = buildDemoScenario("miles", "2026-11-04");

describe("memoryPlanStore", () => {
  test("a successful write bumps the version", () => {
    const store = memoryPlanStore(demo.plans);
    const { version } = store.read();
    const changed = demo.plans.map((d, i) => (i === 0 ? { ...d, label: `${d.label} ` } : d));
    const res = store.write(changed, version);
    expect(res.ok).toBe(true);
    const after = store.read();
    expect(after.version).not.toBe(version);
    expect(after.version).toBe(planVersion(changed));
    expect(after.plans).toBe(changed);
  });

  test("a stale write leaves the stored plans untouched", () => {
    const store = memoryPlanStore(demo.plans);
    const changed = demo.plans.map((d, i) => (i === 0 ? { ...d, label: "CLOBBERED" } : d));
    const res = store.write(changed, "v-wrong");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("stale");
    expect(store.read().plans[0].label).not.toBe("CLOBBERED");
  });

  test("a failed write leaves the stored plans untouched", () => {
    const store = memoryPlanStore(demo.plans, { failNextWrite: () => true });
    const { version } = store.read();
    const changed = demo.plans.map((d, i) => (i === 0 ? { ...d, label: "CLOBBERED" } : d));
    const res = store.write(changed, version);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("failed");
    expect(store.read().plans[0].label).not.toBe("CLOBBERED");
    expect(store.read().version).toBe(version);
  });

  test("an external edit makes the next write stale", () => {
    const store = memoryPlanStore(demo.plans);
    const { version } = store.read();
    store.simulateExternalEdit();
    const res = store.write(demo.plans, version);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("stale");
  });
});

/* localPlanStore — the real `meridian:lastPlan` seam. localStorage is
   stubbed in-process; the store is the only writer under test. */

import { localPlanStore } from "../src/lib/plan-store";
import type { EvalResult } from "../src/domain/types";

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    get size() { return m.size; },
  } as unknown as Storage;
};

const route = { origin: "LHR", dest: "HND", date: "2026-11-03" };
const seedPlan = (over: Record<string, unknown> = {}) => ({
  summary: "ok", score: 0.9, ics: "ICS", lines: ["l"], coverage: { complete: true },
  days: demo.plans, baseline: { x: 1 }, savedAt: "t", ...over,
});
const seedTrip = () => ({
  origin: { code: "LHR" }, destination: { code: "HND" },
  departureDayIndex: demo.trip.departureDayIndex,
  days: [{ dayIndex: demo.trip.departureDayIndex, date: "2026-11-03" }],
});

const withStore = (fn: (ls: Storage) => void) => {
  const ls = mem();
  withStubbedGlobal("localStorage", ls, () => fn(ls));
};

describe("localPlanStore", () => {
  test("wrong route → empty read, failed write", () => {
    withStore((ls) => {
      ls.setItem("meridian:lastPlan", JSON.stringify(seedPlan()));
      ls.setItem("meridian:lastTrip", JSON.stringify({ ...seedTrip(), destination: { code: "CDG" } }));
      const s = localPlanStore({ route });
      expect(s.read().plans).toEqual([]);
      expect(s.write(demo.plans, "v")).toEqual({ ok: false, reason: "failed" });
    });
  });

  test("a stale write leaves storage untouched", () => {
    withStore((ls) => {
      ls.setItem("meridian:lastPlan", JSON.stringify(seedPlan()));
      ls.setItem("meridian:lastTrip", JSON.stringify(seedTrip()));
      const s = localPlanStore({ route });
      const changed = demo.plans.map((d, i) => (i === 0 ? { ...d, label: "CLOBBERED" } : d));
      expect(s.write(changed, "v-wrong")).toEqual({ ok: false, reason: "stale" });
      expect(JSON.parse(ls.getItem("meridian:lastPlan")!).days[0].label).not.toBe("CLOBBERED");
    });
  });

  test("a failed write (setItem throws) leaves storage untouched", () => {
    withStore((ls) => {
      ls.setItem("meridian:lastPlan", JSON.stringify(seedPlan()));
      ls.setItem("meridian:lastTrip", JSON.stringify(seedTrip()));
      const s = localPlanStore({ route });
      const { version } = s.read();
      const orig = ls.setItem.bind(ls);
      (ls as { setItem: (k: string, v: string) => void }).setItem = () => { throw new Error("quota"); };
      const res = s.write(demo.plans, version);
      expect(res).toEqual({ ok: false, reason: "failed" });
      expect(ls.getItem("meridian:lastPlan")!).toBe(JSON.stringify(seedPlan()));
      (ls as { setItem: (k: string, v: string) => void }).setItem = orig;
    });
  });

  test("fields preserved; score/coverage from meta; ics/lines dropped; editedAt set", () => {
    withStore((ls) => {
      ls.setItem("meridian:lastPlan", JSON.stringify(seedPlan()));
      ls.setItem("meridian:lastTrip", JSON.stringify(seedTrip()));
      const s = localPlanStore({ route });
      const { version } = s.read();
      const result = { score: 0.77, coverage: { complete: false } } as unknown as EvalResult;
      const res = s.write(demo.plans, version, { result });
      expect(res.ok).toBe(true);
      const saved = JSON.parse(ls.getItem("meridian:lastPlan")!);
      expect(saved.summary).toBe("ok");
      expect(saved.baseline).toEqual({ x: 1 });
      expect(saved.score).toBe(0.77);
      expect(saved.coverage).toEqual({ complete: false });
      expect(saved.ics).toBeUndefined();
      expect(saved.lines).toBeUndefined();
      expect(typeof saved.editedAt).toBe("string");
    });
  });

  test("without meta, score/coverage are dropped rather than left stale", () => {
    withStore((ls) => {
      ls.setItem("meridian:lastPlan", JSON.stringify(seedPlan()));
      ls.setItem("meridian:lastTrip", JSON.stringify(seedTrip()));
      const s = localPlanStore({ route });
      const { version } = s.read();
      s.write(demo.plans, version);
      const saved = JSON.parse(ls.getItem("meridian:lastPlan")!);
      expect(saved.score).toBeUndefined();
      expect(saved.coverage).toBeUndefined();
    });
  });
});

/* Edit → feed sync: a successful write rebuilds the ics from the calendar
   persisted at lock and pushes it to the subscription + reminder feed. */

describe("localPlanStore feed sync", () => {
  const trip = seedTrip();
  const cal = [
    { id: "ev-1", title: "Standup", dayIndex: 0, startMin: 600, endMin: 630,
      movedTo: { dayIndex: 1, startMin: 660, endMin: 690 } },
  ];

  test("stored calendar → ics rebuilt, feed synced with the new days", async () => {
    withStore((ls) => {
      ls.setItem("meridian:lastPlan", JSON.stringify(seedPlan({ calendar: cal })));
      ls.setItem("meridian:lastTrip", JSON.stringify(trip));
      ls.setItem("meridian:feed", JSON.stringify({ id: "f1", key: "k1" }));
      const calls: { url: string; body: string }[] = [];
      const origFetch = globalThis.fetch;
      (globalThis as { fetch: unknown }).fetch = async (u: string, init?: { body?: string }) => {
        calls.push({ url: String(u), body: String(init?.body) });
        return new Response("{}", { status: 200 });
      };
      try {
        const s = localPlanStore({ route });
        const { version } = s.read();
        const res = s.write(demo.plans, version);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.sync).toBe("synced");
        const saved = JSON.parse(ls.getItem("meridian:lastPlan")!);
        expect(saved.ics).toContain("rescheduled by Meridian");
        expect(calls.length).toBe(1);
        expect(calls[0].url).toBe("/api/feed");
        const body = JSON.parse(calls[0].body);
        expect(body.id).toBe("f1");
        expect(body.key).toBe("k1");
        expect(body.ics).toBe(saved.ics);
        expect(body.days).toEqual(JSON.parse(JSON.stringify(demo.plans)));
      } finally {
        (globalThis as { fetch: unknown }).fetch = origFetch;
      }
    });
  });

  test("no stored calendar → ics dropped, no fetch, sync reports it", () => {
    withStore((ls) => {
      ls.setItem("meridian:lastPlan", JSON.stringify(seedPlan()));
      ls.setItem("meridian:lastTrip", JSON.stringify(trip));
      ls.setItem("meridian:feed", JSON.stringify({ id: "f1", key: "k1" }));
      const origFetch = globalThis.fetch;
      let called = 0;
      (globalThis as { fetch: unknown }).fetch = async () => { called++; return new Response("{}", { status: 200 }); };
      try {
        const s = localPlanStore({ route });
        const { version } = s.read();
        const res = s.write(demo.plans, version);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.sync).toBe("no-calendar");
        expect(JSON.parse(ls.getItem("meridian:lastPlan")!).ics).toBeUndefined();
        expect(called).toBe(0);
      } finally {
        (globalThis as { fetch: unknown }).fetch = origFetch;
      }
    });
  });

  test("no feed ref → ics stored, nothing fetched, sync reports it", () => {
    withStore((ls) => {
      ls.setItem("meridian:lastPlan", JSON.stringify(seedPlan({ calendar: cal })));
      ls.setItem("meridian:lastTrip", JSON.stringify(trip));
      const origFetch = globalThis.fetch;
      let called = 0;
      (globalThis as { fetch: unknown }).fetch = async () => { called++; return new Response("{}", { status: 200 }); };
      try {
        const s = localPlanStore({ route });
        const { version } = s.read();
        const res = s.write(demo.plans, version);
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.sync).toBe("no-feed");
        expect(JSON.parse(ls.getItem("meridian:lastPlan")!).ics).toContain("VCALENDAR");
        expect(called).toBe(0);
      } finally {
        (globalThis as { fetch: unknown }).fetch = origFetch;
      }
    });
  });
});
