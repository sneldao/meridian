import { describe, expect, it } from "bun:test";
import { buildDemoScenario, isDemoScenarioId } from "../src/domain/demo-scenarios";
import { evaluatePlan } from "../src/domain/circadian";
import { ADHERENCE_PROFILE, GARMIN_BASELINE } from "../src/domain/fixtures";
import { performanceMoment } from "../src/domain/trip-performance";
import { sampleTasteProfile } from "../src/lib/sample-taste";

describe("demo scenarios", () => {
  it("known ids only; invalid dates rejected", () => {
    expect(isDemoScenarioId("jason")).toBe(true);
    expect(isDemoScenarioId("cedric")).toBe(true);
    expect(isDemoScenarioId("alex")).toBe(true);
    expect(isDemoScenarioId("elon")).toBe(false);
    expect(() => buildDemoScenario("jason", "2026-02-30")).toThrow();
    expect(() => buildDemoScenario("jason", "garbage")).toThrow();
  });

  it("fixed names, non-movable post-flight event, real solver plans", () => {
    const originalFixtures = JSON.stringify({ GARMIN_BASELINE, ADHERENCE_PROFILE });
    const d = buildDemoScenario("cedric", "2026-11-04");
    expect(d.scenario.name).toBe("Cedric the Entertainer");
    expect(d.event.title).toBe("Evening performance");
    expect(d.event.movable).toBe(false);
    expect(d.event.dayIndex).toBe(d.trip.departureDayIndex + 1);
    expect(d.plans.length).toBeGreaterThan(0);
    for (const p of d.plans) {
      expect(p.interventions.length).toBeGreaterThan(0);
      expect(Number.isInteger(p.dayIndex)).toBe(true);
    }
    for (const id of ["jason", "cedric", "alex"] as const) {
      const sample = buildDemoScenario(id, "2026-11-04");
      for (let i = 0; i < sample.plans.length; i++) {
        const res = evaluatePlan({ trip: sample.trip, days: sample.plans.slice(0, i + 1), calendar: sample.calendar, adherence: ADHERENCE_PROFILE, baseline: sample.baseline });
        expect(res.feasible).toBe(true);
      }
    }
    expect(JSON.stringify({ GARMIN_BASELINE, ADHERENCE_PROFILE })).toBe(originalFixtures);
    expect(d.baseline.wearer).toBe("Fictional demo profile");
    expect(JSON.stringify(d.baseline)).toContain("Fictional demo profile");
  });

  it("jason morning misses D+1, afternoon fits it (2026-11-04)", () => {
    const am = buildDemoScenario("jason", "2026-11-04", "morning");
    const pm = buildDemoScenario("jason", "2026-11-04", "afternoon");
    const d1 = am.trip.departureDayIndex + 1;
    expect(am.plans.some((p) => p.dayIndex === d1)).toBe(false);
    expect(pm.plans.some((p) => p.dayIndex === d1)).toBe(true);
    for (const id of ["cedric", "alex"] as const) {
      const x = buildDemoScenario(id, "2026-11-04");
      expect(x.plans.some((p) => p.dayIndex === d1)).toBe(true);
    }
  });

  it("performanceMoment credits only pre-event shifts; none => without-plan estimate", () => {
    const d = buildDemoScenario("cedric", "2026-11-04");
    const input = { trip: d.trip, calendar: d.calendar, baseline: d.baseline };
    const before = d.plans.filter((p) => p.dayIndex < d.event.dayIndex);
    const seed = d.plans[0];
    const same = { ...seed, dayIndex: d.event.dayIndex, shiftMin: -90 };
    const after = { ...seed, dayIndex: d.event.dayIndex + 1, shiftMin: -90 };
    const base = performanceMoment({ ...input, plans: before });
    expect(performanceMoment({ ...input, plans: [...before, same, after] })?.bodyMin).toBe(base?.bodyMin);
    expect(performanceMoment({ ...input, plans: [] })?.bodyMin).toBe(base?.bodyWithoutPlanMin);
    expect(performanceMoment({ ...input, plans: d.plans, calendar: [] })).toBeNull();
  });

  it("sample taste snapshot matches frozen expectation", () => {
    expect(sampleTasteProfile("bjork")!.places.length).toBe(6);
    expect(sampleTasteProfile("luke")!.places.length).toBe(2);
    expect(sampleTasteProfile("nobody")).toBeNull();
  });
});
