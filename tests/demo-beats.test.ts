import { describe, expect, test } from "bun:test";
import {
  clockLabel,
  DEMO_BEAT_IDS,
  DEMO_DEPARTURE_DATE,
  demoJourney,
  planRows,
  stakesGapHours,
} from "@/domain/demo-beats";

/* The demo journey (round 19) is a claim about the product, so it is built
 * out of the product: the solver's own scenario builder, arrivalRead, and
 * arrivalPassport. These tests lock the story the /demo page is allowed to
 * tell — every number on screen must trace back here. */

describe("demoJourney", () => {
  const j = demoJourney("jason");

  test("runs on the fixed example week", () => {
    expect(DEMO_DEPARTURE_DATE).toBe("2026-11-03");
    expect(j.trip.origin.code).toBe("LHR");
    expect(j.trip.destination.code).toBe("HND");
  });

  test("the moment carries both clock readings — with and without the plan", () => {
    expect(j.moment.title).toBe("Investment meeting");
    // The stakes line: local time vs an unadjusted body clock.
    expect(clockLabel(j.moment.localMin)).toBe("16:00");
    expect(clockLabel(j.moment.bodyWithoutPlanMin)).toBe("07:00");
    // The plan moves the body reading — that delta is the whole pitch.
    expect(j.moment.bodyMin).not.toBe(j.moment.bodyWithoutPlanMin);
  });

  test("the gap headline is the wrapped clock distance, honest to a decimal", () => {
    expect(stakesGapHours(j.moment)).toBe(9);
  });

  test("the payoff is computed on the arrival morning, and it is honest", () => {
    expect(j.read.arrived).toBe(true);
    expect(j.read.projection).not.toBeNull();
    // The plan cannot deliver more than the trip requires.
    const p = j.read.projection!;
    expect(p.deliveredHours).toBeLessThanOrEqual(p.requiredHours);
    expect(p.hours).toBeLessThan(p.baselineHours);
  });

  test("the passport stamps what the projection carries — never invented", () => {
    expect(j.passport).not.toBeNull();
    const stamp = j.passport!.stamp;
    const hours = j.read.projection!.hours;
    if (hours <= 1.05) expect(stamp).toBe("ADJUSTED");
    else if (hours <= 3) expect(stamp).toBe("ALMOST");
    else expect(stamp).toBe("OWED");
    // No check-ins happened in a demo — the marks line stays silent.
    expect(j.passport!.marksLine).toBeNull();
  });

  test("every scenario produces a complete journey", () => {
    for (const id of ["jason", "cedric", "alex"] as const) {
      const s = demoJourney(id);
      expect(s.plans.length).toBeGreaterThan(0);
      expect(s.read.arrived).toBe(true);
      expect(planRows(s).length).toBeGreaterThan(0);
    }
  });
});

describe("planRows", () => {
  test("reads the arrival day in clock order, in the traveller-facing words", () => {
    const rows = planRows(demoJourney("jason"));
    const times = rows.map((r) => r.time);
    expect([...times].sort()).toEqual(times);
    // Canonical vocabulary only — no raw snake_case ever reaches a screen.
    for (const r of rows) {
      expect(r.label).not.toContain("_");
      expect(r.note.length).toBeGreaterThan(0);
    }
  });
});

describe("clockLabel", () => {
  test("wraps and pads like a clock", () => {
    expect(clockLabel(0)).toBe("00:00");
    expect(clockLabel(1439)).toBe("23:59");
    expect(clockLabel(1500)).toBe("01:00");
    expect(clockLabel(-60)).toBe("23:00");
  });
});

describe("the beats", () => {
  test("are the journey spine in story order", () => {
    expect(DEMO_BEAT_IDS).toEqual(["stakes", "crew", "plan", "payoff"]);
  });
});
