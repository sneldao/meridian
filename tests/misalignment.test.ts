import { describe, expect, test } from "bun:test";
import {
  ALCOHOL_UNCERTAINTY_MIN,
  PER_DAY_SUPPORT_UNCERTAINTY_MIN,
  PHASE_UNCERTAINTY_MIN,
  SKIP_UNCERTAINTY_MIN,
  WEARABLE_PHASE_UNCERTAINTY_MIN,
  circularDistanceMin,
  circularSignedDiffMin,
  computeTripTrajectory,
  daylightWindowMin,
  directionOptions,
  shiftBetweenTimezonesOnDates,
  sleepMidpointMin,
} from "../src/domain/misalignment";
import { modelShiftMin } from "../src/domain/circadian";
import { buildTrip, CALENDAR, DEMO_TRIP, GARMIN_BASELINE } from "../src/domain/fixtures";
import type { DayPlan } from "../src/domain/types";

describe("circular time", () => {
  test("midnight wrap keeps the sign and the distance", () => {
    // 23:15 (1395) to 00:45 (45) is +90 minutes, not 1350.
    expect(circularSignedDiffMin(45, 1395)).toBe(90);
    expect(circularSignedDiffMin(1395, 45)).toBe(-90);
    expect(circularDistanceMin(1395, 45)).toBe(90);
  });

  test("the sleep midpoint handles an overnight window", () => {
    expect(sleepMidpointMin(23 * 60, 7 * 60)).toBe(3 * 60);
  });
});

describe("timezone shifts across the 25 Oct 2026 clock change", () => {
  test("London is UTC+1 before the change and UTC+0 after it", () => {
    const before = shiftBetweenTimezonesOnDates(
      "Europe/London",
      "2026-10-18",
      "Asia/Tokyo",
      "2026-10-18",
    );
    expect(before.originOffsetMin).toBe(60);
    expect(before.destOffsetMin).toBe(540);
    expect(before.requiredShiftMin).toBe(-480);
    expect(before.hoursAbs).toBe(8);

    const after = shiftBetweenTimezonesOnDates(
      "Europe/London",
      "2026-10-25",
      "Asia/Tokyo",
      "2026-10-25",
    );
    expect(after.originOffsetMin).toBe(0);
    expect(after.destOffsetMin).toBe(540);
    expect(after.requiredShiftMin).toBe(-540);
    expect(after.hoursAbs).toBe(9);
  });

  test("a trip departing after the change is planned against the new offset", () => {
    const trip = buildTrip("LHR", "HND", "2026-10-28");
    expect(trip.requiredShiftMin).toBe(-540);
  });
});

describe("the trajectory is derived from the phase-response model", () => {
  const noDays: DayPlan[] = [];

  test("with no plan the body clock does not move", () => {
    const traj = computeTripTrajectory({
      trip: DEMO_TRIP,
      days: noDays,
      baseline: GARMIN_BASELINE,
      calendar: CALENDAR,
    });
    expect(traj).toHaveLength(DEMO_TRIP.days.length);
    // The gap is the whole trip, because nothing was done about it.
    expect(traj[0].misalignmentHours).toBe(8);
    expect(traj[0].baselineMisalignmentHours).toBe(8);
    expect(traj[0].modelledShiftMin).toBe(0);
    expect(traj[0].declaredShiftMin).toBe(0);
  });

  test("a plan's declared shift is not credited unless the timing supports it", () => {
    const mistimed: DayPlan = {
      dayIndex: 0,
      label: "D-3",
      shiftMin: -90, // the plan claims 90 minutes
      targetBedtimeMin: (23 * 60 + 55 - 90 + 1440) % 1440,
      targetWakeMin: (6 * 60 + 45 - 90 + 1440) % 1440,
      interventions: [
        // Light at 15:00 local: nowhere near the body's dawn zone.
        { kind: "light_exposure", startMin: 15 * 60, endMin: 16 * 60, note: "" },
      ],
    };
    const traj = computeTripTrajectory({
      trip: DEMO_TRIP,
      days: [mistimed],
      baseline: GARMIN_BASELINE,
      calendar: [],
    });
    const day = traj[0];
    expect(day.declaredShiftMin).toBe(-90);
    // The model supports far less than the plan claims, and the projection
    // uses the model's number, not the plan's.
    expect(Math.abs(day.modelledShiftMin)).toBeLessThan(90);
    expect(day.misalignmentHours).toBeGreaterThan(7);
  });

  test("well-timed light is credited, and the gap closes faster than doing nothing", () => {
    const wellTimed: DayPlan = {
      dayIndex: 0,
      label: "D-3",
      shiftMin: -60,
      targetBedtimeMin: (23 * 60 + 55 - 60 + 1440) % 1440,
      targetWakeMin: (6 * 60 + 45 - 60 + 1440) % 1440,
      interventions: [
        { kind: "light_exposure", startMin: 6 * 60 + 30, endMin: 7 * 60 + 30, note: "" },
      ],
    };
    const traj = computeTripTrajectory({
      trip: DEMO_TRIP,
      days: [wellTimed],
      baseline: GARMIN_BASELINE,
      calendar: [],
    });
    const day = traj[0];
    expect(Math.abs(day.modelledShiftMin)).toBeGreaterThan(0);
    expect(day.misalignmentHours).toBeLessThan(day.baselineMisalignmentHours);
  });

  test("the modelled support is the same number the scorer gates on", () => {
    const day: DayPlan = {
      dayIndex: 0,
      label: "D-3",
      shiftMin: -60,
      targetBedtimeMin: 22 * 60 + 55,
      targetWakeMin: 5 * 60 + 45,
      interventions: [
        { kind: "light_exposure", startMin: 6 * 60 + 30, endMin: 7 * 60 + 30, note: "" },
      ],
    };
    const traj = computeTripTrajectory({
      trip: DEMO_TRIP,
      days: [day],
      baseline: GARMIN_BASELINE,
      calendar: [],
    });
    const support = modelShiftMin(
      day,
      { bedtimeMin: GARMIN_BASELINE.avgBedtimeMin, wakeMin: GARMIN_BASELINE.avgWakeMin },
      { bedtimeMin: GARMIN_BASELINE.avgBedtimeMin, wakeMin: GARMIN_BASELINE.avgWakeMin },
    );
    // The projection may cap at the physiological ceiling, but it never
    // exceeds what the phase-response model says the timing supports.
    expect(Math.abs(traj[0].modelledShiftMin)).toBeLessThanOrEqual(Math.abs(support));
  });

  test("a skipped day loses its clock movers and the projection slips", () => {
    const day: DayPlan = {
      dayIndex: 0,
      label: "D-3",
      shiftMin: -60,
      targetBedtimeMin: (23 * 60 + 55 - 60 + 1440) % 1440,
      targetWakeMin: (6 * 60 + 45 - 60 + 1440) % 1440,
      interventions: [
        { kind: "light_exposure", startMin: 6 * 60 + 30, endMin: 7 * 60 + 30, note: "" },
      ],
    };
    const done = computeTripTrajectory({
      trip: DEMO_TRIP,
      days: [day],
      baseline: GARMIN_BASELINE,
      calendar: [],
    });
    const skipped = computeTripTrajectory({
      trip: DEMO_TRIP,
      days: [day],
      baseline: GARMIN_BASELINE,
      calendar: [],
      skippedDayIndices: new Set([0]),
    });
    expect(Math.abs(skipped[0].modelledShiftMin)).toBeLessThan(
      Math.abs(done[0].modelledShiftMin),
    );
    expect(skipped[0].misalignmentHours).toBeGreaterThan(done[0].misalignmentHours);
    // The band widens: the day did not happen as modelled.
    expect(skipped[0].uncertaintyHalfWidthMin).toBe(
      done[0].uncertaintyHalfWidthMin + SKIP_UNCERTAINTY_MIN,
    );
  });
});

describe("the uncertainty band says what it is made of", () => {
  const trip = DEMO_TRIP;
  const base = { trip, days: [], baseline: GARMIN_BASELINE, calendar: [] };

  test("a wearable narrows the band, self-report does not", () => {
    const self = computeTripTrajectory(base)[0];
    const measured = computeTripTrajectory({ ...base, wearableOptedIn: true })[0];
    // Day 0 carries the baseline's own uncertainty plus one day of support
    // error; a wearable knows the starting phase better, so the band starts
    // tighter and stays tighter.
    expect(self.uncertaintyHalfWidthMin).toBe(
      PHASE_UNCERTAINTY_MIN + PER_DAY_SUPPORT_UNCERTAINTY_MIN,
    );
    expect(measured.uncertaintyHalfWidthMin).toBe(
      WEARABLE_PHASE_UNCERTAINTY_MIN + PER_DAY_SUPPORT_UNCERTAINTY_MIN,
    );
    expect(measured.uncertaintyHalfWidthMin).toBeLessThan(self.uncertaintyHalfWidthMin);
  });

  test("independent days accumulate as a random walk, not a sum", () => {
    const traj = computeTripTrajectory(base);
    const later = traj[traj.length - 1].uncertaintyHalfWidthMin;
    const linear = PHASE_UNCERTAINTY_MIN + PER_DAY_SUPPORT_UNCERTAINTY_MIN * (traj.length - 1);
    expect(later).toBeLessThan(linear);
    expect(later).toBeGreaterThan(PHASE_UNCERTAINTY_MIN);
  });

  test("drinking widens the band without inventing a phase shift", () => {
    const dry = computeTripTrajectory(base)[0];
    const wet = computeTripTrajectory({
      ...base,
      alcoholDayIndices: new Set([0]),
    })[0];
    expect(wet.uncertaintyHalfWidthMin).toBe(dry.uncertaintyHalfWidthMin + ALCOHOL_UNCERTAINTY_MIN);
    expect(wet.modelledShiftMin).toBe(dry.modelledShiftMin);
  });

  test("the band never claims more certainty than it has", () => {
    const traj = computeTripTrajectory({
      ...base,
      skippedDayIndices: new Set([0, 1, 2, 3, 4]),
      alcoholDayIndices: new Set([0, 1, 2, 3, 4]),
    });
    for (const day of traj) {
      expect(day.uncertaintyHalfWidthMin).toBeLessThanOrEqual(90);
      expect(day.misalignmentLowHours).toBeLessThanOrEqual(day.misalignmentHours);
      expect(day.misalignmentHighHours).toBeGreaterThanOrEqual(day.misalignmentHours);
    }
  });
});

describe("the advance-vs-delay options are honest about what can be executed", () => {
  test("the trip's own direction is the executable one", () => {
    const [executable, alternative] = directionOptions(DEMO_TRIP, "neutral");
    expect(executable.id).toBe("advance");
    expect(executable.executable).toBe(true);
    expect(executable.hours).toBe(8);
    expect(alternative.id).toBe("delay");
    expect(alternative.executable).toBe(false);
    expect(alternative.hours).toBe(16);
    expect(alternative.note).toContain("scorer rejects");
  });

  test("a westward trip is executable as a delay", () => {
    const west = buildTrip("LHR", "JFK", "2026-10-15");
    const [executable] = directionOptions(west, "neutral");
    expect(executable.id).toBe("delay");
    expect(executable.executable).toBe(true);
  });
});

describe("ambient daylight in the destination", () => {
  test("Tokyo's daylight window is a morning-to-evening arc on the trip date", () => {
    const tokyo = DEMO_TRIP.destination;
    const win = daylightWindowMin(tokyo, "2026-10-18");
    expect(win).not.toBeNull();
    expect(win!.startMin).toBeGreaterThan(4 * 60);
    expect(win!.startMin).toBeLessThan(7 * 60);
    expect(win!.endMin).toBeGreaterThan(16 * 60);
    expect(win!.endMin).toBeLessThan(18 * 60 + 30);
  });
});
