import { describe, expect, test } from "bun:test";
import { coverageOf, effectiveCalendar, evaluatePlan, passes } from "../src/domain/circadian";
import type { Citation, DayPlan, Trip } from "../src/domain/types";
import { DEMO_TRIP, ADHERENCE_PROFILE, CALENDAR, buildTrip } from "../src/domain/fixtures";

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

describe("evidence integrity", () => {
  const day = (citationId?: string): DayPlan => ({
    dayIndex: 0,
    label: "D-3",
    shiftMin: -60,
    targetBedtimeMin: 23 * 60,
    targetWakeMin: 7 * 60,
    interventions: [{ kind: "light_exposure", startMin: 7 * 60, note: "morning light", citationId }],
  });

  const citations: Citation[] = [{ id: "W4309308783", title: "Circadian acclimatization", url: "https://doi.org/10.3389/fendo.2022.964681" }];

  test("a citation in the research set is accepted", () => {
    const r = evaluatePlan({ trip, days: [day("W4309308783")], calendar: CALENDAR, adherence: ADHERENCE_PROFILE, citations });
    expect(r.violations.some((v) => v.code === "UNKNOWN_CITATION")).toBe(false);
    expect(r.feasible).toBe(true);
  });

  test("a hallucinated citation fails the gate and names the valid ids", () => {
    const r = evaluatePlan({ trip, days: [day("W9999999999")], calendar: CALENDAR, adherence: ADHERENCE_PROFILE, citations });
    const v = r.violations.find((x) => x.code === "UNKNOWN_CITATION");
    expect(v).toBeDefined();
    expect(v!.message).toContain("W4309308783"); // the retry needs the valid set
    expect(r.feasible).toBe(false);
  });

  test("with no research set supplied the check is skipped, not failed", () => {
    const r = evaluatePlan({ trip, days: [day("anything")], calendar: CALENDAR, adherence: ADHERENCE_PROFILE });
    expect(r.violations.some((v) => v.code === "UNKNOWN_CITATION")).toBe(false);
  });
});

describe("SHIFT_DIRECTION_FLIP", () => {
  const d = (i: number, shiftMin: number): DayPlan => ({
    dayIndex: i,
    label: `Day ${i}`,
    shiftMin,
    targetBedtimeMin: 23 * 60,
    targetWakeMin: 7 * 60,
    interventions: [],
  });
  const flips = (days: DayPlan[]) =>
    evaluatePlan({ trip, days, calendar: CALENDAR, adherence: ADHERENCE_PROFILE })
      .violations.filter((v) => v.code === "SHIFT_DIRECTION_FLIP");

  test("a hold day does not block resuming the same direction", () => {
    expect(flips([d(0, -90), d(1, 0), d(2, -60)])).toEqual([]);
  });

  test("a hold day does not hide a real flip", () => {
    const v = flips([d(0, -90), d(1, 0), d(2, 60)]);
    expect(v.length).toBe(1);
    expect(v[0].dayIndex).toBe(2);
  });

  test("adjacent opposite shifts still flip", () => {
    const v = flips([d(0, -90), d(1, 30)]);
    expect(v.length).toBe(1);
    expect(v[0].dayIndex).toBe(1);
  });

  test("a hold then a wrong-way shift flips against trip direction", () => {
    const v = flips([d(0, 0), d(1, 60)]);
    expect(v.length).toBe(1);
    expect(v[0].dayIndex).toBe(1);
  });

  test("a first-day wrong-way shift flips against trip direction", () => {
    const v = flips([d(0, 30)]);
    expect(v.length).toBe(1);
    expect(v[0].dayIndex).toBe(0);
  });

  test("returning to the right direction is the correction, not a second flip", () => {
    const v = flips([d(0, 0), d(1, 60), d(2, -30)]);
    expect(v.length).toBe(1);
    expect(v[0].dayIndex).toBe(1);
  });

  test("a first-day with-direction shift does not flip", () => {
    const west = buildTrip("LHR", "JFK", "2026-10-18");
    const v = evaluatePlan({
      trip: west,
      days: [d(0, 0), d(1, 60)],
      calendar: [],
      adherence: ADHERENCE_PROFILE,
    }).violations.filter((x) => x.code === "SHIFT_DIRECTION_FLIP");
    expect(v).toEqual([]);
  });
});

describe("WRONG_WAY_CUE", () => {
  // A day's zeitgebers can push the clock against the trip even when the day
  // claims nothing. The declared shift is not the only thing that moves a
  // clock — and the arrival morning is where travellers get it wrong.
  const arrivalDay = (lightStartMin: number, lightEndMin: number): DayPlan => ({
    dayIndex: 4,
    label: "D+1",
    shiftMin: 0,
    targetBedtimeMin: 21 * 60,
    targetWakeMin: 5 * 60,
    interventions: [
      { kind: "light_exposure", startMin: lightStartMin, endMin: lightEndMin, note: "morning light" },
      { kind: "sleep_window", startMin: 21 * 60, endMin: 5 * 60, note: "" },
    ],
  } as unknown as DayPlan);

  /** The days before the arrival day, as the demo scripts them. */
  const upToArrival: DayPlan[] = [
    { dayIndex: 0, label: "D-3", shiftMin: -90, targetBedtimeMin: 22 * 60 + 25, targetWakeMin: 5 * 60 + 15, interventions: [] } as unknown as DayPlan,
    { dayIndex: 1, label: "D-2", shiftMin: 0, targetBedtimeMin: 22 * 60 + 25, targetWakeMin: 5 * 60 + 15, interventions: [] } as unknown as DayPlan,
    { dayIndex: 2, label: "D-1", shiftMin: 0, targetBedtimeMin: 22 * 60 + 25, targetWakeMin: 5 * 60 + 15, interventions: [] } as unknown as DayPlan,
    { dayIndex: 3, label: "Flight", shiftMin: 0, targetBedtimeMin: 12 * 60 + 30, targetWakeMin: 18 * 60 + 30, interventions: [] } as unknown as DayPlan,
  ];

  const score = (days: DayPlan[]) =>
    evaluatePlan({
      trip,
      days,
      calendar: CALENDAR,
      adherence: ADHERENCE_PROFILE,
      baseline: { avgBedtimeMin: 23 * 60 + 55, avgWakeMin: 6 * 60 + 45 },
    });

  test("light before the body's own trough fails an eastward trip", () => {
    // 07:00 local, while the body's trough is later: this light pushes a
    // traveller who needs to advance further behind. It is the single most
    // common way to make eastward jet lag worse.
    const r = score([...upToArrival, arrivalDay(7 * 60, 8 * 60 + 30)]);
    const v = r.violations.find((x) => x.code === "WRONG_WAY_CUE");
    expect(v).toBeDefined();
    expect(v?.dayIndex).toBe(4);
    expect(r.feasible).toBe(false);
  });

  test("light in the body's dawn zone passes the same day", () => {
    const r = score([...upToArrival, arrivalDay(11 * 60 + 45, 12 * 60 + 45)]);
    expect(r.violations.some((x) => x.code === "WRONG_WAY_CUE")).toBe(false);
  });

  test("the in-flight day is not judged — transit is not an anchor", () => {
    const r = score([
      ...upToArrival.slice(0, 3),
      { dayIndex: 3, label: "Flight", shiftMin: 0, targetBedtimeMin: 12 * 60 + 30, targetWakeMin: 18 * 60 + 30,
        interventions: [{ kind: "light_exposure", startMin: 7 * 60, endMin: 8 * 60, note: "cabin lights" }] } as unknown as DayPlan,
    ]);
    expect(r.violations.some((x) => x.code === "WRONG_WAY_CUE")).toBe(false);
  });

  test("the message tells the planner what to do about it", () => {
    const r = score([...upToArrival, arrivalDay(7 * 60, 8 * 60 + 30)]);
    const v = r.violations.find((x) => x.code === "WRONG_WAY_CUE");
    // The violation string feeds the planner's retry prompt, so it has to say
    // what to change, not just that something is wrong.
    expect(v?.message).toContain("wrong way");
    expect(v?.message).toContain("phase zone");
  });
});

describe("coverage", () => {
  const dayAt = (shiftMin: number): DayPlan => ({
    dayIndex: 0,
    label: "D-3",
    shiftMin,
    targetBedtimeMin: 23 * 60,
    targetWakeMin: 7 * 60,
    interventions: [],
  });

  test("an under-covered shift is reported, never failed", () => {
    // LHR->HND needs 480 minutes; five days at the 90 min ceiling only reach 450.
    // Every day is otherwise well-formed, so any failure here would be the
    // coverage rule leaking into the feasibility gate — which it must not.
    const days = [0, 1, 2, 3, 4].map((i) => ({
      ...dayAt(-90),
      dayIndex: i,
      interventions: [{ kind: "light_exposure" as const, startMin: 7 * 60, note: "morning light" }],
    }));
    const r = evaluatePlan({ trip, days, calendar: CALENDAR, adherence: ADHERENCE_PROFILE });
    expect(r.feasible).toBe(true);
    expect(r.coverage.achievedMin).toBe(450);
    expect(r.coverage.requiredMin).toBe(480);
    expect(r.coverage.residualMin).toBe(30);
    expect(r.coverage.complete).toBe(false);
    expect(r.coverage.ratio).toBeCloseTo(0.9375, 4);
    expect(r.notes.join(" ")).toContain("still owed at landing");
  });

  test("a westward trip nets out correctly", () => {
    const west = buildTrip("LHR", "JFK", "2026-10-18");
    const days = [0, 1].map((i) => ({ ...dayAt(120), dayIndex: i, shiftMin: 120 }));
    const c = coverageOf(west, days);
    expect(west.requiredShiftMin).toBeGreaterThan(0);
    expect(c.achievedMin).toBe(240);
  });

  test("a direction flip cannot inflate coverage", () => {
    const flip = [dayAt(-90), { ...dayAt(90), dayIndex: 1 }];
    const c = coverageOf(trip, flip);
    expect(c.achievedMin).toBe(0);
  });

  test("a fully covered shift reports complete", () => {
    const days = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ ...dayAt(-90), dayIndex: i }));
    expect(coverageOf(trip, days).complete).toBe(true);
  });
});

describe("effectiveCalendar", () => {
  test("folds moves in so the gate judges the calendar the user gets", () => {
    const moved = [
      { id: "a", title: "Gym", dayIndex: 0, startMin: 600, endMin: 660, movable: true, movedTo: { dayIndex: 1, startMin: 420, endMin: 480 } },
    ];
    const eff = effectiveCalendar(moved);
    expect(eff[0]).toMatchObject({ dayIndex: 1, startMin: 420, endMin: 480 });
    expect(moved[0]).toMatchObject({ dayIndex: 0, startMin: 600 }); // source untouched
  });
});