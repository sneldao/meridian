import { describe, expect, test } from "bun:test";
import { readCheckIns, skippedClockDays } from "../src/domain/marks";
import { computeTripTrajectory } from "../src/domain/misalignment";
import { solveDay } from "../src/domain/solver";
import { ADHERENCE_PROFILE, CALENDAR, DEMO_TRIP, GARMIN_BASELINE } from "../src/domain/fixtures";
import type { CheckIn, DayPlan } from "../src/domain/types";

// The dial shows where the body clock will be. That is only true if it knows
// what the traveller actually did — a day whose light was missed is a day
// whose light did not happen.

const mark = (over: Partial<CheckIn> = {}): CheckIn => ({
  id: "c1",
  dayIndex: 0,
  kind: "light_exposure",
  status: "skipped",
  at: Date.parse("2026-10-16T07:05:00Z"),
  ...over,
});

describe("the traveller's marks", () => {
  test("a missed clock-moving cue marks the day", () => {
    expect([...skippedClockDays([mark()])]).toEqual([0]);
  });

  test("missing the caffeine does not move the clock", () => {
    expect(skippedClockDays([mark({ kind: "caffeine_cutoff" })]).size).toBe(0);
  });

  test("a free-text note about the day does not count", () => {
    // We cannot tell what a day-level note skipped, so it does not.
    expect(skippedClockDays([mark({ kind: undefined })]).size).toBe(0);
  });

  test("only a skip counts — a done or partial step still happened", () => {
    expect(skippedClockDays([mark({ status: "done" })]).size).toBe(0);
    expect(skippedClockDays([mark({ status: "partial" })]).size).toBe(0);
  });

  test("corrupt or absent storage is no marks, not a crash", () => {
    expect(readCheckIns(null)).toEqual([]);
    expect(readCheckIns("not json")).toEqual([]);
    expect(readCheckIns('{"nope":1}')).toEqual([]);
    expect(readCheckIns('[{"dayIndex":"x"}]')).toEqual([]);
  });

  test("the marks survive a round trip through storage", () => {
    const stored = JSON.stringify([mark(), mark({ id: "c2", dayIndex: 2 })]);
    expect([...skippedClockDays(readCheckIns(stored))].sort()).toEqual([0, 2]);
  });
});

describe("the projection listens to the marks", () => {
  const trip = DEMO_TRIP;

  const planFor = (): DayPlan[] => {
    const out: DayPlan[] = [];
    for (const spec of trip.days) {
      const r = solveDay({
        trip,
        spec,
        lockedDays: out,
        calendar: CALENDAR,
        adherence: ADHERENCE_PROFILE,
        baseline: GARMIN_BASELINE,
      });
      if (r) out.push(r.plan);
    }
    return out;
  };

  test("a missed light day is no longer counted as shift banked", () => {
    const days = planFor();
    const asPlanned = computeTripTrajectory({
      trip,
      days,
      baseline: GARMIN_BASELINE,
      calendar: CALENDAR,
    });
    const withTheSkip = computeTripTrajectory({
      trip,
      days,
      baseline: GARMIN_BASELINE,
      calendar: CALENDAR,
      skippedDayIndices: skippedClockDays([mark({ dayIndex: 0 })]),
    });

    // The day the traveller missed is further off than the plan promised.
    const planned = asPlanned[0];
    const skipped = withTheSkip[0];
    expect(skipped.misalignmentHours).toBeGreaterThan(planned.misalignmentHours);
    expect(skipped.modelledShiftMin).toBeGreaterThan(planned.modelledShiftMin);
  });
});
