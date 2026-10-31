import { describe, expect, it } from "bun:test";
import { aggregateFunnel, type FunnelEventRow } from "../src/lib/funnel-summary";
import { GET } from "../src/app/api/funnel/summary/route";

/* The readable half of the funnel (round 22): the aggregator turns raw rows
 * into reach, trip-level conversion, and a pulse; the route stays locked
 * without a key and honest without Supabase. */

const NOW = new Date("2026-11-01T12:00:00Z");
const at = (daysAgo: number, h = 9) =>
  new Date(NOW.getTime() - daysAgo * 86400000 + h * 3600000 - 12 * 3600000).toISOString();

const row = (stage: FunnelEventRow["stage"], trip: string | null, daysAgo: number): FunnelEventRow => ({
  stage,
  trip,
  at: at(daysAgo),
});

describe("aggregateFunnel", () => {
  it("counts events and distinct trips per stage", () => {
    const s = aggregateFunnel(
      [
        row("entry", "LHR-SIN-1", 2),
        row("entry", "LHR-SIN-1", 2), // a repeat entry is still one trip
        row("entry", "SFO-NRT-2", 1),
        row("run", "LHR-SIN-1", 2),
        row("arrival", "LHR-SIN-1", 0),
      ],
      { now: NOW },
    );
    expect(s.stages.entry.events).toBe(3);
    expect(s.stages.entry.trips).toBe(2);
    expect(s.stages.run.trips).toBe(1);
    expect(s.stages.arrival.trips).toBe(1);
    expect(s.totalEvents).toBe(5);
  });

  it("converts between consecutive stages on trips, and refuses empty denominators", () => {
    const s = aggregateFunnel(
      [row("entry", "A", 1), row("entry", "B", 1), row("run", "A", 1)],
      { now: NOW },
    );
    expect(s.conversion["entry->run"]).toBe(0.5);
    expect(s.conversion["run->handoff"]).toBe(0); // trip A ran but never handed off
    expect(s.conversion["arrival->outcome"]).toBeNull(); // no arrival trips: no signal
  });

  it("drops events outside the window and from the future", () => {
    const s = aggregateFunnel(
      [
        row("entry", "OLD", 45), // outside the 30-day default
        row("entry", "NOW", 1),
        { stage: "entry", trip: "FUTURE", at: new Date(NOW.getTime() + 3 * 86400000).toISOString() },
      ],
      { now: NOW },
    );
    expect(s.stages.entry.trips).toBe(1);
    expect(s.totalEvents).toBe(1);
  });

  it("keeps a trailing-week pulse, oldest first", () => {
    const rows: FunnelEventRow[] = [];
    for (let d = 12; d >= 0; d--) rows.push(row("entry", `T${d}`, d));
    const s = aggregateFunnel(rows, { now: NOW });
    expect(s.recent.length).toBe(7);
    expect(s.recent[0].day < s.recent[6].day).toBe(true);
    expect(s.recent[6].day).toBe(NOW.toISOString().slice(0, 10));
  });

  it("ignores rows with a stage outside the locked vocabulary", () => {
    const s = aggregateFunnel(
      [{ stage: "launch" as FunnelEventRow["stage"], trip: "X", at: at(1) }],
      { now: NOW },
    );
    expect(s.totalEvents).toBe(0);
  });
});

describe("GET /api/funnel/summary", () => {
  const url = "http://localhost/api/funnel/summary";
  const prev = process.env.FUNNEL_SUMMARY_KEY;

  it("stays locked when no key is configured", async () => {
    delete process.env.FUNNEL_SUMMARY_KEY;
    const res = await GET(new Request(url));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("FUNNEL_SUMMARY_KEY");
  });

  it("rejects a wrong key", async () => {
    process.env.FUNNEL_SUMMARY_KEY = "open-sesame";
    const res = await GET(new Request(`${url}?key=wrong`));
    expect(res.status).toBe(403);
  });

  it("answers honestly without Supabase — configured: false, empty summary", async () => {
    process.env.FUNNEL_SUMMARY_KEY = "open-sesame";
    const res = await GET(new Request(`${url}?key=open-sesame`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.summary.totalEvents).toBe(0);
    expect(body.summary.windowDays).toBe(30);
  });

  it("accepts the key by header too, and clamps the window", async () => {
    process.env.FUNNEL_SUMMARY_KEY = "open-sesame";
    const res = await GET(
      new Request(`${url}?days=9999`, { headers: { "x-funnel-key": "open-sesame" } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.windowDays).toBe(90);
  });

  it("restores the environment", () => {
    if (prev === undefined) delete process.env.FUNNEL_SUMMARY_KEY;
    else process.env.FUNNEL_SUMMARY_KEY = prev;
    expect(true).toBe(true);
  });
});
