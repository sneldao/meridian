import { describe, expect, test } from "bun:test";
import { restorePlan } from "../src/lib/restore-plan";
import { buildTrip } from "../src/domain/fixtures";
import type { DayPlan } from "../src/domain/types";

const trip = buildTrip("LHR", "HND", "2026-05-10");
const depDate = trip.days.find((d) => d.dayIndex === trip.departureDayIndex)!.date;
const route = { origin: "LHR", dest: "HND", date: depDate };

const day = (label: string): DayPlan =>
  ({
    label,
    dayIndex: 0,
    shiftMin: 30,
    targetWakeMin: 420,
    targetBedtimeMin: 1320,
    interventions: [],
    notes: "",
  }) as unknown as DayPlan;

const plan = JSON.stringify({ days: [day("D-3"), day("D-2"), day("D-1")] });
const tripRaw = JSON.stringify(trip);

describe("restorePlan", () => {
  test("matching plan + trip returns the days keyed by label", () => {
    const map = restorePlan(plan, tripRaw, route);
    expect(map).not.toBeNull();
    expect([...map!.keys()]).toEqual(["D-3", "D-2", "D-1"]);
    expect(map!.get("D-2")!.shiftMin).toBe(30);
  });

  test("a different route restores nothing", () => {
    expect(restorePlan(plan, tripRaw, { ...route, dest: "JFK" })).toBeNull();
    expect(restorePlan(plan, tripRaw, { ...route, origin: "SFO" })).toBeNull();
  });

  test("a different departure date restores nothing", () => {
    expect(restorePlan(plan, tripRaw, { ...route, date: "2026-05-11" })).toBeNull();
  });

  test("corrupt JSON restores nothing", () => {
    expect(restorePlan("{oops", tripRaw, route)).toBeNull();
    expect(restorePlan(plan, "{oops", route)).toBeNull();
  });

  test("an empty days array restores nothing", () => {
    expect(restorePlan(JSON.stringify({ days: [] }), tripRaw, route)).toBeNull();
  });

  test("null inputs restore nothing", () => {
    expect(restorePlan(null, tripRaw, route)).toBeNull();
    expect(restorePlan(plan, null, route)).toBeNull();
    expect(restorePlan(null, null, route)).toBeNull();
  });
});
