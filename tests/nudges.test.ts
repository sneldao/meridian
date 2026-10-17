import { describe, expect, test } from "bun:test";
import { buildDailyNudgesForDay, stepImpactMin } from "../src/domain/nudges";
import { previewPlan } from "../src/domain/solver";
import type { DayPlan } from "../src/domain/types";
import { ADHERENCE_PROFILE, CALENDAR, DEMO_TRIP, GARMIN_BASELINE } from "../src/domain/fixtures";

const trip = DEMO_TRIP;
const floor = ADHERENCE_PROFILE.ignoresInterventionsBeforeMin;

const preview = previewPlan({
  trip,
  calendar: CALENDAR,
  adherence: ADHERENCE_PROFILE,
  baseline: GARMIN_BASELINE,
});

const planFor = (dayIndex: number): DayPlan | undefined =>
  preview.get(trip.days[dayIndex].label)?.plan;

const nudgesFor = (dayIndex: number) =>
  buildDailyNudgesForDay({
    trip,
    dayIndex,
    plan: planFor(dayIndex),
    calendarEvents: CALENDAR,
    moves: [],
    citations: [],
    adherence: ADHERENCE_PROFILE,
  });

/** [startMin, endMin] with an end earlier than the start read as next-day. */
const span = (n: { startMin: number; endMin: number }) => ({
  s: n.startMin,
  e: n.endMin < n.startMin ? n.endMin + 1440 : n.endMin,
});

describe("buildDailyNudgesForDay", () => {
  test("returns no steps without a plan — never invents times", () => {
    const steps = buildDailyNudgesForDay({
      trip,
      dayIndex: 0,
      calendarEvents: CALENDAR,
      moves: [],
      citations: [],
      adherence: ADHERENCE_PROFILE,
    });
    expect(steps).toEqual([]);
  });

  test("D-2: every step except sleep starts at/after the 07:00 floor", () => {
    const steps = nudgesFor(1);
    expect(steps.length).toBeGreaterThan(0);
    for (const n of steps) {
      if (n.category === "sleep") continue;
      expect(n.startMin).toBeGreaterThanOrEqual(floor);
    }
  });

  test("no step overlaps a fixed calendar event on its day", () => {
    const fixed = CALENDAR.filter((e) => e.movable === false && e.blocksInterventions !== false);
    for (const spec of trip.days) {
      for (const n of nudgesFor(spec.dayIndex)) {
        if (n.category === "sleep") continue; // the sleep window is exempt
        const { s, e } = span(n);
        for (const ev of fixed.filter((ev) => ev.dayIndex === spec.dayIndex)) {
          expect(s < ev.endMin && ev.startMin < e).toBe(false);
        }
      }
    }
  });

  test("a calendar suggestion never lands on another event", () => {
    for (const spec of trip.days) {
      const cal = nudgesFor(spec.dayIndex).find((n) => n.category === "calendar");
      if (!cal) continue;
      const { s, e } = span(cal);
      const clash = CALENDAR.some(
        (ev) => ev.dayIndex === spec.dayIndex && s < ev.endMin && ev.startMin < e,
      );
      expect(clash).toBe(false);
    }
  });

  test("flight day has no run step without an exercise intervention", () => {
    const flight = nudgesFor(trip.departureDayIndex);
    expect(planFor(trip.departureDayIndex)?.interventions.some((iv) => iv.kind === "exercise")).toBeFalsy();
    expect(flight.some((n) => n.category === "run")).toBe(false);
  });

  test("5B4: run paired with light is named as deliberate, not a duplicate 07:00", () => {
    // The run doubles as the light dose by design (runStart === light start);
    // the title says so instead of reading as two simultaneous asks. Pre-flight
    // east days pair at the floor; the arrival day keeps its destination copy
    // ("Easy run outside in Tokyo") — the pairing read matters where the
    // complaint was (two 07:00 windows), not where the run is the payoff.
    const paired = nudgesFor(0);
    const run = paired.find((n) => n.category === "run");
    const sun = paired.find((n) => n.category === "sunlight");
    expect(run && sun && run.startMin === sun.startMin).toBe(true);
    expect(run!.title).toBe("Run + light together");
  });
});

test("sunlight step only exists when the plan carries a light iv, and never at wake", () => {
  const planNoLight: DayPlan = {
    dayIndex: 0, label: "D-3", shiftMin: 0,
    targetBedtimeMin: 22 * 60 + 25, targetWakeMin: 5 * 60 + 15,
    interventions: [
      { kind: "caffeine_cutoff", startMin: 14 * 60 + 20, note: "" },
      { kind: "sleep_window", startMin: 22 * 60 + 25, endMin: 5 * 60 + 15, note: "" },
    ],
  };
  const out = buildDailyNudgesForDay({
    trip, dayIndex: 0, plan: planNoLight, baseline: GARMIN_BASELINE,
    calendarEvents: CALENDAR, moves: [], citations: [], adherence: ADHERENCE_PROFILE,
  });
  expect(out.find((n) => n.category === "sunlight")).toBeUndefined();
});

test("stepImpactMin distributes only the scored shift, honestly", () => {
  const solved = preview.get("D-3")!.plan;   // shift −90
  const hold = preview.get("D-2")!.plan;     // shift 0
  expect(stepImpactMin(solved, "sunlight")).toBeGreaterThan(stepImpactMin(solved, "nutrition"));
  expect(stepImpactMin(solved, "calendar")).toBe(0);
  expect(stepImpactMin(hold, "sunlight")).toBe(0);
});
