import { describe, expect, test } from "bun:test";
import { evaluatePlan, passes } from "../src/domain/circadian";
import type { DayPlan, Trip } from "../src/domain/types";
import { DEMO_TRIP, ADHERENCE_PROFILE, CALENDAR } from "../src/domain/fixtures";

const trip: Trip = DEMO_TRIP;

describe("evaluatePlan", () => {
  test("a sane single-day plan can pass", () => {
    const r = evaluatePlan({
      trip,
      days: [trip.days[0] && {
        dayIndex: 0,
        label: "D-3",
        shiftMin: -60,
        targetBedtimeMin: 23 * 60,
        targetWakeMin: 7 * 60,
        interventions: [{ kind: "light_exposure", startMin: 7 * 60, note: "morning light" }],
      } as unknown as DayPlan],
      calendar: CALENDAR,
      adherence: ADHERENCE_PROFILE,
    });
    expect(r.feasible).toBe(true);
    expect(passes(r)).toBe(true);
  });

  test("dosing in a note fails the scope gate", () => {
    const r = evaluatePlan({
      trip,
      days: [{
        dayIndex: 0,
        label: "D-3",
        shiftMin: -60,
        targetBedtimeMin: 23 * 60,
        targetWakeMin: 7 * 60,
        interventions: [{ kind: "melatonin", startMin: 21 * 60, note: "take 3 mg melatonin" }],
      } as unknown as DayPlan],
      calendar: CALENDAR,
      adherence: ADHERENCE_PROFILE,
    });
    expect(r.feasible).toBe(false);
    expect(r.violations.some((v) => v.code === "DOSE_PRESCRIPTION")).toBe(true);
  });
});