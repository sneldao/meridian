import { describe, expect, test } from "bun:test";
import { buildTrip, CALENDAR, DEMO_TRIP, GARMIN_BASELINE } from "../src/domain/fixtures";
import {
  bodyClockMin,
  isAsleep,
  meetingReadiness,
  remainingLagMin,
  sleepWindow,
} from "../src/domain/readiness";
import type { CalendarEvent, DayPlan, WearableBaseline } from "../src/domain/types";

const meet = (startMin: number, dayIndex: number, id = "m"): CalendarEvent => ({
  id,
  title: "Meeting",
  dayIndex,
  startMin,
  endMin: startMin + 60,
  movable: false,
});

// The replayed night shift for London → Tokyo: 380 of 480 minutes covered.
const REPLAY_PLAN: DayPlan[] = [-60, -75, -65, -90, -90].map((shiftMin, dayIndex) => ({
  dayIndex,
  label: `D${dayIndex}`,
  shiftMin,
  targetBedtimeMin: 22 * 60,
  targetWakeMin: 6 * 60,
  interventions: [],
}));

describe("body clock direction", () => {
  test("east subtracts the lag, west adds it", () => {
    expect(bodyClockMin(14 * 60, 480, "east")).toBe(6 * 60);
    expect(bodyClockMin(9 * 60, 300, "west")).toBe(14 * 60);
  });

  test("wraps past midnight", () => {
    expect(bodyClockMin(60, 120, "east")).toBe(23 * 60);
  });
});

describe("sleep window", () => {
  test("is the wearer's habitual window padded 45 minutes each side", () => {
    expect(sleepWindow(GARMIN_BASELINE)).toEqual({ start: 23 * 60 + 10, end: 7 * 60 + 30 });
  });

  test("01:00 body time is asleep, 12:00 is not", () => {
    const w = sleepWindow(GARMIN_BASELINE);
    expect(isAsleep(60, w)).toBe(true);
    expect(isAsleep(12 * 60, w)).toBe(false);
  });
});

describe("meeting readiness", () => {
  test("LHR → JFK 09:00 is body 14:00 and ready (westward was wrong before)", () => {
    const trip = buildTrip("LHR", "JFK", "2026-10-18");
    const [r] = meetingReadiness(trip, [meet(9 * 60, 4)], []);
    expect(r.bodyMin).toBe(14 * 60);
    expect(r.status).toBe("ready");
  });

  test("LHR → JFK 20:00 is body 01:00 and at risk, not ready", () => {
    const trip = buildTrip("LHR", "JFK", "2026-10-18");
    const [r] = meetingReadiness(trip, [meet(20 * 60, 4)], []);
    expect(r.bodyMin).toBe(60);
    expect(r.status).toBe("risk");
    expect(r.suggestedLocalMin).toBe(10 * 60);
  });

  test("LHR → HND D+1 14:00 is body 06:00 unadapted (risk), suggests a business slot", () => {
    const [r] = meetingReadiness(DEMO_TRIP, [meet(14 * 60, 4)], []);
    expect(r.bodyMin).toBe(6 * 60);
    expect(r.status).toBe("risk");
    expect(r.suggestedLocalMin).toBe(16 * 60);
    expect(r.text).toContain("Rex suggests 16:00");
  });

  test("the replayed plan brings the same meeting to body 12:20 (ready), with the before/after line", () => {
    const pitch = CALENDAR.find((e) => e.id === "ev-pitch");
    expect(pitch).toBeDefined();
    const [r] = meetingReadiness(DEMO_TRIP, [pitch!], REPLAY_PLAN);
    expect(remainingLagMin(DEMO_TRIP, REPLAY_PLAN)).toBe(100);
    expect(r.bodyMin).toBe(12 * 60 + 20);
    expect(r.bodyWithoutPlanMin).toBe(6 * 60);
    expect(r.status).toBe("ready");
    expect(r.text).toContain("without Meridian your body thinks it's 06:00; with the plan, 12:20");
  });

  test("no business-hours slot clears sleep: move to D+2", () => {
    const trip = buildTrip("LHR", "JFK", "2026-10-18");
    const nightOwl: WearableBaseline = { ...GARMIN_BASELINE, avgBedtimeMin: 14 * 60, avgWakeMin: 23 * 60 };
    const [r] = meetingReadiness(trip, [meet(9 * 60, 4)], [], nightOwl);
    expect(r.status).toBe("risk");
    expect(r.moveToNextDay).toBe(true);
    expect(r.suggestedLocalMin).toBeUndefined();
  });

  test("destination meetings before the flight are excluded", () => {
    expect(meetingReadiness(DEMO_TRIP, [meet(9 * 60, 1)], [])).toHaveLength(0);
  });
});
