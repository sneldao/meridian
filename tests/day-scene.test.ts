import { describe, expect, test } from "bun:test";
import { buildDayScene, inspectDayScene, sceneSolar, sceneWallInstant } from "../src/domain/day-scene";
import { buildDemoScenario } from "../src/domain/demo-scenarios";
import { buildTrip } from "../src/domain/fixtures";
import type { City, DayPlan } from "../src/domain/types";

describe("day-scene clocks and solar geometry", () => {
  const london: City = { code: "LHR", name: "London", lat: 51.47, lon: -0.45, utcOffsetMin: 0, tz: "Europe/London" };

  test("resolves actual local dates, half-hour offsets, and refuses DST ambiguity", () => {
    expect(sceneWallInstant(london, "2026-11-05", 600)).toBe(Date.parse("2026-11-05T10:00:00Z"));
    expect(sceneWallInstant(london, "2026-07-05", 600)).toBe(Date.parse("2026-07-05T09:00:00Z"));
    const kathmandu = { ...london, utcOffsetMin: 345, tz: "Asia/Kathmandu" };
    expect(sceneWallInstant(kathmandu, "2026-11-05", 180)).toBe(Date.parse("2026-11-04T21:15:00Z"));
    expect(sceneWallInstant(london, "2026-03-29", 90)).toBeNull();
    expect(sceneWallInstant(london, "2026-10-25", 90)).toBeNull();
    expect(sceneWallInstant(london, "2026-02-30", 600)).toBeNull();
    expect(sceneWallInstant({ ...london, tz: "invalid-zone" }, "2026-11-05", 600)).toBeNull();
  });

  test("astronomical scene handles polar day and night instead of assuming 06–18 daylight", () => {
    const tromso: City = { code: "TOS", name: "Tromsø", lat: 69.68, lon: 18.92, utcOffsetMin: 120, tz: "Europe/Oslo" };
    expect(sceneSolar(tromso, "2026-06-21", 0)!.altitude).toBeGreaterThan(0);
    expect(sceneSolar(tromso, "2026-12-21", 720)!.altitude).toBeLessThan(0);
    expect(sceneSolar(london, "2026-03-29", 90)).toBeNull();
  });

  test("all three post-flight moments agree with the existing conservative model", () => {
    for (const [id, localMin, bodyMin] of [["jason", 960, 510], ["cedric", 1200, 750], ["alex", 840, 390]] as const) {
      const demo = buildDemoScenario(id, "2026-11-04");
      const original = JSON.stringify(demo);
      const scene = buildDayScene({ ...demo, dayIndex: demo.event.dayIndex })!;
      expect(inspectDayScene(scene, localMin).bodyMin).toBe(bodyMin);
      expect(scene.moment?.bodyMin).toBe(bodyMin);
      expect(scene.city.name).toBe("Tokyo");
      expect(scene.momentDate).toBe("2026-11-05");
      expect(scene.solarPoints).toHaveLength(49);
      inspectDayScene(scene, 0);
      inspectDayScene(scene, 1439);
      expect(JSON.stringify(demo)).toBe(original);
    }
  });

  test("pre-flight frame stays in origin and only earlier days shift the estimate", () => {
    const demo = buildDemoScenario("jason", "2026-11-04");
    const plans = [{ ...demo.plans[0], dayIndex: 0, shiftMin: -30 }];
    const first = buildDayScene({ ...demo, plans, dayIndex: 0 })!;
    const next = buildDayScene({ ...demo, plans, dayIndex: 1 })!;
    expect(first.city.code).toBe("LHR");
    expect(inspectDayScene(first, 600).bodyMin).toBe(600);
    expect(inspectDayScene(next, 600).bodyMin).toBe(630);
    expect(next.momentDate).toBe(first.momentDate);
    expect(buildDayScene({ ...demo, dayIndex: 99 })).toBeNull();
  });

  test("westbound body clock leads local time and never includes later plans", () => {
    const trip = buildTrip("HND", "LHR", "2026-11-04");
    const dayIndex = trip.departureDayIndex + 1;
    const scene = buildDayScene({ trip, dayIndex, plans: [], calendar: [] })!;
    expect(inspectDayScene(scene, 600).bodyMin).toBe(1140);
    expect(scene.moment).toBeNull();
  });
});

describe("day-scene dated windows", () => {
  const demo = buildDemoScenario("jason", "2026-11-04");
  const plan: DayPlan = {
    ...demo.plans[0],
    dayIndex: 0,
    interventions: [{ kind: "sleep_window", startMin: 1320, endMin: 360, note: "Overnight" }],
  };

  test("overnight windows continue into the next date, not the same morning", () => {
    const first = buildDayScene({ ...demo, plans: [plan], dayIndex: 0 })!;
    const next = buildDayScene({ ...demo, plans: [plan], dayIndex: 1 })!;
    expect(first.windows.map((w) => [w.startMin, w.endMin])).toEqual([[1320, 1440]]);
    expect(next.windows.map((w) => [w.startMin, w.endMin])).toEqual([[0, 360]]);
    expect(first.windows[0].continuesAfter).toBe(true);
    expect(next.windows[0].continuesBefore).toBe(true);
    expect(next.windows[0].fromEarlierDay).toBe(true);
    expect(inspectDayScene(first, 60).activeWindows).toHaveLength(0);
    expect(inspectDayScene(next, 60).activeWindows).toHaveLength(1);
    expect(inspectDayScene(next, 360).activeWindows).toHaveLength(0);
  });

  test("carry-over across the flight boundary converts origin to destination time", () => {
    const flight = { ...plan, dayIndex: demo.trip.departureDayIndex, interventions: [{ kind: "avoid_light" as const, startMin: 1320, endMin: 120, note: "Across flight day" }] };
    const scene = buildDayScene({ ...demo, plans: [flight], dayIndex: demo.event.dayIndex })!;
    expect(scene.windows.map((w) => [w.startMin, w.endMin])).toEqual([[420, 660]]);
    expect(scene.windows[0].fromEarlierDay).toBe(true);
  });

  test("start-only interventions have no invented duration; missing plans stay missing", () => {
    const startOnly = { ...plan, interventions: [{ kind: "light_exposure" as const, startMin: 600, note: "Start" }] };
    const scene = buildDayScene({ ...demo, plans: [startOnly], dayIndex: 0 })!;
    expect(scene.windows).toEqual([]);
    const empty = buildDayScene({ ...demo, plans: [], dayIndex: 0 })!;
    expect(empty.plan).toBeNull();
    expect(empty.windows).toEqual([]);
  });
});
