import { describe, expect, test } from "bun:test";
import { modelShiftMin, evaluatePlan, passes } from "../src/domain/circadian";
import { previewPlan, solveDay } from "../src/domain/solver";
import type { DayPlan } from "../src/domain/types";
import { ADHERENCE_PROFILE, CALENDAR, DEMO_TRIP, GARMIN_BASELINE, buildTrip } from "../src/domain/fixtures";

const trip = DEMO_TRIP; // LHR → HND, east, 480min advance

const day = (over: Partial<DayPlan> = {}): DayPlan => ({
  dayIndex: 0,
  label: "D-3",
  shiftMin: -60,
  targetBedtimeMin: 23 * 60,
  targetWakeMin: 7 * 60,
  interventions: [],
  ...over,
});

describe("modelShiftMin", () => {
  test("morning light in the post-CBTmin window supports an advance", () => {
    const d = day({
      interventions: [{ kind: "light_exposure", startMin: 7 * 60, endMin: 8 * 60, note: "anchor" }],
    });
    // CBTmin ≈ 05:00, light midpoint 07:30 → +150min → advance.
    expect(modelShiftMin(d)).toBeLessThan(0);
  });

  test("evening light counts toward delay, not advance", () => {
    const d = day({
      interventions: [{ kind: "light_exposure", startMin: 21 * 60, endMin: 22 * 60, note: "evening" }],
    });
    // Midpoint 21:30 vs CBTmin 05:00 → ~7.5h before → delay support.
    expect(modelShiftMin(d)).toBeGreaterThan(0);
  });

  test("avoiding light in the delay zone supports the advance", () => {
    const d = day({
      interventions: [{ kind: "avoid_light", startMin: 21 * 60, endMin: 22 * 60, note: "screens down" }],
    });
    expect(modelShiftMin(d)).toBeLessThan(0);
  });

  test("moving the sleep window earlier earns support", () => {
    const d = day({ targetBedtimeMin: 22 * 60, targetWakeMin: 6 * 60 });
    const modeled = modelShiftMin(d, { bedtimeMin: 23 * 60, wakeMin: 7 * 60 });
    expect(modeled).toBeLessThan(0);
    expect(Math.abs(modeled)).toBeLessThanOrEqual(45); // capped
  });
});

describe("SHIFT_OVERSTATED gate", () => {
  test("a claim with no zeitgeber support fails", () => {
    const r = evaluatePlan({
      trip,
      days: [day({ shiftMin: -90 })],
      calendar: CALENDAR,
      adherence: ADHERENCE_PROFILE,
    });
    expect(r.feasible).toBe(false);
    expect(r.violations.some((v) => v.code === "SHIFT_OVERSTATED")).toBe(true);
  });

  test("a claim opposed by the light timing fails", () => {
    const r = evaluatePlan({
      trip,
      days: [
        day({
          shiftMin: -90,
          interventions: [{ kind: "light_exposure", startMin: 21 * 60, endMin: 23 * 60, note: "evening light" }],
        }),
      ],
      calendar: CALENDAR,
      adherence: ADHERENCE_PROFILE,
    });
    expect(r.feasible).toBe(false);
    expect(r.violations.some((v) => v.code === "SHIFT_OVERSTATED")).toBe(true);
  });

  test("a modest claim backed by timed light passes, with a model note", () => {
    // −90 with 60min of wake light and no sleep reference: support 60, gap 30
    // — inside tolerance, so it passes but the thin margin is noted.
    const r = evaluatePlan({
      trip,
      days: [
        day({
          shiftMin: -90,
          interventions: [{ kind: "light_exposure", startMin: 7 * 60, endMin: 8 * 60, note: "morning light" }],
        }),
      ],
      calendar: CALENDAR,
      adherence: ADHERENCE_PROFILE,
    });
    expect(r.feasible).toBe(true);
    expect(passes(r)).toBe(true);
    expect(r.notes.join(" ")).toContain("model supports");
  });
});

describe("solveDay", () => {
  test("produces a feasible day for the demo route", () => {
    const solved = solveDay({
      trip,
      spec: trip.days[0],
      lockedDays: [],
      calendar: CALENDAR,
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    expect(solved).not.toBeNull();
    expect(passes(solved!.result)).toBe(true);
    expect(solved!.plan.shiftMin).toBeLessThan(0); // eastward = advance
    // The whole point: the solver's output is already scorer-clean.
    const check = evaluatePlan({
      trip,
      days: [solved!.plan],
      calendar: CALENDAR,
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    expect(check.feasible).toBe(true);
  });

  test("solves a westward day as a delay", () => {
    const west = buildTrip("LHR", "JFK", "2026-10-18");
    const solved = solveDay({
      trip: west,
      spec: west.days[0],
      lockedDays: [],
      calendar: [],
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    expect(solved).not.toBeNull();
    expect(solved!.plan.shiftMin).toBeGreaterThan(0);
    expect(passes(solved!.result)).toBe(true);
  });

  test("stays within what the trip still owes", () => {
    const small = buildTrip("LHR", "CDG", "2026-10-18"); // 1h east
    const solved = solveDay({
      trip: small,
      spec: small.days[0],
      lockedDays: [],
      calendar: [],
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    expect(solved).not.toBeNull();
    expect(Math.abs(solved!.plan.shiftMin)).toBeLessThanOrEqual(Math.abs(small.requiredShiftMin));
  });

  test("post-flight days sleep at local night, anchored on body phase", () => {
    // After landing the schedule is local-night (baseline times), not the
    // phase-converted flight schedule — the old draft produced unusable
    // times like bed 04:55/wake 11:45 Tokyo. The phase still decides where
    // the zeitgebers land: a lagging eastbound body's CBT sits mid-morning,
    // so light goes in the advance zone after it.
    const locked: DayPlan[] = [];
    for (const spec of trip.days.slice(0, 4)) {
      const s = solveDay({ trip, spec, lockedDays: locked, calendar: CALENDAR, adherence: ADHERENCE_PROFILE, baseline: GARMIN_BASELINE });
      if (s) locked.push(s.plan);
    }
    const solved = solveDay({
      trip,
      spec: trip.days[4],
      lockedDays: locked,
      calendar: CALENDAR,
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    expect(solved).not.toBeNull();
    // Local-night targets — not the converted 06:25/13:15 Tokyo.
    expect(solved!.plan.targetBedtimeMin).toBe(GARMIN_BASELINE.avgBedtimeMin);
    expect(solved!.plan.targetWakeMin).toBe(GARMIN_BASELINE.avgWakeMin);
    expect(passes(solved!.result)).toBe(true);
    // The light anchor sits after the lagging body's CBT (~11:00 Tokyo).
    const light = solved!.plan.interventions.find((iv) => iv.kind === "light_exposure");
    expect(light!.startMin).toBeGreaterThanOrEqual(9 * 60);
  });
});

describe("previewPlan", () => {
  const preview = previewPlan({
    trip,
    calendar: CALENDAR,
    adherence: ADHERENCE_PROFILE,
    baseline: GARMIN_BASELINE,
  });

  test("has an entry for every day label", () => {
    expect(preview.size).toBe(trip.days.length);
    for (const spec of trip.days) expect(preview.has(spec.label)).toBe(true);
  });

  test("every non-null day passes the scorer with the days locked before it", () => {
    const prior: DayPlan[] = [];
    for (const spec of trip.days) {
      const solved = preview.get(spec.label);
      if (!solved) continue;
      const check = evaluatePlan({
        trip,
        days: [...prior, solved.plan],
        calendar: CALENDAR,
        adherence: ADHERENCE_PROFILE,
        baseline: GARMIN_BASELINE,
      });
      expect(passes(check)).toBe(true);
      prior.push(solved.plan);
    }
  });

  test("east days never wake earlier than floor − 105 unless holding", () => {
    const floor = ADHERENCE_PROFILE.ignoresInterventionsBeforeMin;
    for (const spec of trip.days) {
      const solved = preview.get(spec.label);
      if (!solved || solved.plan.shiftMin === 0) continue;
      // Unwrapped comparison would be ideal; fixture wakes stay in the
      // early-morning range so the wrapped value is safe here.
      expect(solved.plan.targetWakeMin).toBeGreaterThanOrEqual(floor - 105);
    }
  });

  test("light starts at/after the floor unless every ≥floor slot is blocked", () => {
    const floor = ADHERENCE_PROFILE.ignoresInterventionsBeforeMin;
    for (const spec of trip.days) {
      const solved = preview.get(spec.label);
      if (!solved) continue;
      const iv = solved.plan.interventions.find((i) => i.kind === "light_exposure");
      expect(iv).toBeDefined();
      if (iv!.startMin >= floor) continue;
      // A sub-floor ask is only honest when the whole floor band is blocked.
      const bandFree = [0, 15, 30, 45, 60, 75, 90, 105].some((off) => {
        const s = floor + off;
        return !CALENDAR.some(
          (e) =>
            e.dayIndex === spec.dayIndex &&
            e.blocksInterventions !== false &&
            s < e.endMin &&
            e.startMin < s + 60,
        );
      });
      expect(bandFree).toBe(false);
    }
  });

  test("post-flight days solve — phase-anchored, local-night sleep", () => {
    for (const spec of trip.days) {
      if (spec.dayIndex > trip.departureDayIndex) {
        const solved = preview.get(spec.label);
        expect(solved).not.toBeNull();
        expect(passes(solved!.result)).toBe(true);
        expect(solved!.plan.targetWakeMin).toBe(GARMIN_BASELINE.avgWakeMin);
      }
    }
  });

  test("no light block overlaps a blocking calendar event on its day", () => {
    for (const spec of trip.days) {
      const solved = preview.get(spec.label);
      if (!solved) continue;
      for (const iv of solved.plan.interventions) {
        if (iv.kind !== "light_exposure" || iv.endMin === undefined) continue;
        const clash = CALENDAR.some(
          (e) =>
            e.dayIndex === spec.dayIndex &&
            e.blocksInterventions !== false &&
            iv.startMin < e.endMin &&
            e.startMin < iv.endMin,
        );
        expect(clash).toBe(false);
      }
    }
  });
});

test("previewPlan over the demo trip stays under the render budget", () => {
  const t0 = performance.now();
  previewPlan({ trip, calendar: CALENDAR, adherence: ADHERENCE_PROFILE, baseline: GARMIN_BASELINE });
  expect(performance.now() - t0).toBeLessThan(50);
});
