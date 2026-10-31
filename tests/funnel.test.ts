import { describe, expect, test } from "bun:test";
import {
  FUNNEL_KEY,
  FUNNEL_STAGES,
  funnelKey,
  recordInto,
  type FunnelEvent,
} from "@/lib/funnel";

/* The funnel (round 17): entry → run → handoff → arrival → outcome, once
 * per stage per trip. The browser wrapper is fire-and-forget by contract —
 * the pure core is what gets asserted here. */

const T1 = "LHR-SIN-2026-11-04";
const T2 = "SFO-NRT-2026-12-01";

describe("funnelKey", () => {
  test("is ORIGIN-DEST-DATE, the same shape the share feature uses", () => {
    expect(funnelKey("LHR", "SIN", "2026-11-04")).toBe("LHR-SIN-2026-11-04");
  });
});

describe("recordInto", () => {
  test("records each stage of a journey exactly once", () => {
    let log: FunnelEvent[] = [];
    for (const stage of FUNNEL_STAGES) {
      const r = recordInto(log, stage, T1, `2026-11-0${FUNNEL_STAGES.indexOf(stage) + 1}T00:00:00Z`);
      expect(r.event?.stage).toBe(stage);
      log = r.log;
    }
    expect(log.map((e) => e.stage)).toEqual([...FUNNEL_STAGES]);
  });

  test("a repeated stage for the same trip is deduplicated", () => {
    const once = recordInto([], "entry", T1, "2026-11-01T00:00:00Z");
    const twice = recordInto(once.log, "entry", T1, "2026-11-01T01:00:00Z");
    expect(twice.event).toBeNull();
    expect(twice.log).toEqual(once.log);
  });

  test("the same stage on a different trip is a new event", () => {
    const a = recordInto([], "arrival", T1, "2026-11-04T00:00:00Z");
    const b = recordInto(a.log, "arrival", T2, "2026-12-01T00:00:00Z");
    expect(b.event?.trip).toBe(T2);
    expect(b.log).toHaveLength(2);
  });

  test("a trip-less event dedupes against other trip-less events", () => {
    const a = recordInto([], "outcome", null, "2026-11-04T00:00:00Z");
    const b = recordInto(a.log, "outcome", null, "2026-11-05T00:00:00Z");
    expect(a.event).not.toBeNull();
    expect(b.event).toBeNull();
  });

  test("the ring never grows past its cap", () => {
    let log: FunnelEvent[] = [];
    for (let i = 0; i < 260; i++) {
      const r = recordInto(log, "entry", `TRIP-${i}`, "2026-11-01T00:00:00Z");
      log = r.log;
    }
    expect(log.length).toBe(200);
    // The oldest events fell off the ring; the newest survived.
    expect(log[log.length - 1].trip).toBe("TRIP-259");
    expect(log.some((e) => e.trip === "TRIP-0")).toBe(false);
  });
});

describe("the storage contract", () => {
  test("the ring lives under its documented key", () => {
    expect(FUNNEL_KEY).toBe("meridian:funnel");
  });

  test("the five stages are the locked vocabulary", () => {
    expect(FUNNEL_STAGES).toEqual(["entry", "run", "handoff", "arrival", "outcome"]);
  });
});
