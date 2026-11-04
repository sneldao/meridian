import { describe, expect, it } from "bun:test";
import { buildDemoScenario, DEMO_SCENARIOS, isDemoScenarioId } from "../src/domain/demo-scenarios";
import { evaluatePlan } from "../src/domain/circadian";
import { ADHERENCE_PROFILE, GARMIN_BASELINE } from "../src/domain/fixtures";
import { performanceMoment } from "../src/domain/trip-performance";
import { sampleTasteProfile, sampleTasteProfilesForCity } from "../src/lib/sample-taste";

describe("demo scenarios", () => {
  it("known ids only; invalid dates rejected", () => {
    expect(isDemoScenarioId("miles")).toBe(true);
    expect(isDemoScenarioId("danny")).toBe(true);
    expect(isDemoScenarioId("sofia")).toBe(true);
    expect(isDemoScenarioId("diego")).toBe(true);
    expect(isDemoScenarioId("elon")).toBe(false);
    expect(() => buildDemoScenario("miles", "2026-02-30")).toThrow();
    expect(() => buildDemoScenario("miles", "garbage")).toThrow();
  });

  it("fixed names, non-movable post-flight event, real solver plans", () => {
    const originalFixtures = JSON.stringify({ GARMIN_BASELINE, ADHERENCE_PROFILE });
    const d = buildDemoScenario("danny", "2026-11-04");
    expect(d.scenario.name).toBe("Danny Rivers");
    expect(d.event.title).toBe("Evening performance");
    expect(d.event.movable).toBe(false);
    expect(d.event.dayIndex).toBe(d.trip.departureDayIndex + 1);
    expect(d.plans.length).toBeGreaterThan(0);
    for (const p of d.plans) {
      expect(p.interventions.length).toBeGreaterThan(0);
      expect(Number.isInteger(p.dayIndex)).toBe(true);
    }
    for (const id of ["miles", "danny", "sofia", "diego"] as const) {
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

  it("miles morning misses D+1, afternoon fits it (2026-11-04)", () => {
    const am = buildDemoScenario("miles", "2026-11-04", "morning");
    const pm = buildDemoScenario("miles", "2026-11-04", "afternoon");
    const d1 = am.trip.departureDayIndex + 1;
    expect(am.plans.some((p) => p.dayIndex === d1)).toBe(false);
    expect(pm.plans.some((p) => p.dayIndex === d1)).toBe(true);
    for (const id of ["danny", "sofia"] as const) {
      const x = buildDemoScenario(id, "2026-11-04");
      expect(x.plans.some((p) => p.dayIndex === d1)).toBe(true);
    }
  });

  it("performanceMoment credits only pre-event shifts; none => without-plan estimate", () => {
    const d = buildDemoScenario("danny", "2026-11-04");
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

  it("diego flies his own route and his story stays whole", () => {
    // The flagship dispatch from the film: JFK → MEX, gallery opening the
    // night after landing, told with the Mexico City crate. A 2h westbound
    // shift is the small end of the model — every day must still solve, and
    // the moment must stay post-flight where the stakes machinery looks.
    const d = buildDemoScenario("diego", "2026-11-04");
    expect(d.trip.origin.code).toBe("JFK");
    expect(d.trip.destination.code).toBe("MEX");
    expect(d.event.title).toBe("Gallery opening");
    expect(d.event.dayIndex).toBe(d.trip.departureDayIndex + 1);
    // All days placed — D+1 included. A 19:00 opening blocks the evening
    // light anchor and the day goes unplaced; 18:00–20:00 is the latest
    // reception hour the solver can still plan around.
    expect(d.plans.some((p) => p.dayIndex === d.trip.departureDayIndex + 1)).toBe(true);
    expect(d.plans.length).toBe(d.trip.days.filter((x) => x.dayIndex <= d.trip.departureDayIndex + 1).length);
    // The crate belongs to the city the trip is headed to.
    const profile = sampleTasteProfile(d.scenario.profile);
    expect(profile).not.toBeNull();
    expect(profile!.city).toBe(d.trip.destination.name);
    expect(profile!.places.length).toBeGreaterThan(0);
    // And its provenance says imagined, not recorded — a written crate is
    // never presented as a captured Qloo response.
    expect(profile!.source).toBe("imagined");
    expect(sampleTasteProfile("bjork")!.source).toBe("recorded");
  });

  it("diego leads the list — the film sends viewers to his dispatch", () => {
    expect(DEMO_SCENARIOS[0].id).toBe("diego");
  });

  it("profiles only toggle into journeys headed for their city", () => {
    expect(sampleTasteProfilesForCity("Tokyo").map((p) => p.key).sort()).toEqual(["bjork", "luke"]);
    expect(sampleTasteProfilesForCity("Mexico City").map((p) => p.key)).toEqual(["diego"]);
    expect(sampleTasteProfilesForCity("Nowhere")).toEqual([]);
  });
});
