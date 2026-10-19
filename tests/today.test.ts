import { describe, expect, test } from "bun:test";
import {
  dayPlace,
  heroReadiness,
  nowMinOnDay,
  pickNextStep,
  previewLockedOf,
  shiftLockedPct,
  todayDayIndex,
} from "../src/domain/today";
import type { TravelerNudge } from "../src/domain/nudges";
import type { DayPlan } from "../src/domain/types";
import { DEMO_TRIP } from "../src/domain/fixtures";

const trip = DEMO_TRIP; // LHR → HND, departs 2026-10-18, departureDayIndex 3

const nudge = (id: string, startMin: number, endMin: number): TravelerNudge => ({
  id,
  dayIndex: 0,
  dayLabel: "D-1",
  category: "sunlight",
  title: id,
  timeWindow: "",
  startMin,
  endMin,
  durationLabel: "",
  actionSummary: "",
  whyItHelps: "",
});

const lockedDay = (shiftMin: number): DayPlan => ({
  dayIndex: 0,
  label: "D-3",
  shiftMin,
  targetBedtimeMin: 23 * 60,
  targetWakeMin: 7 * 60,
  interventions: [],
});

describe("dayPlace", () => {
  test("days through the flight day are origin-local, days after are destination-local", () => {
    for (let i = 0; i <= trip.departureDayIndex; i++) {
      expect(dayPlace(trip, i)).toEqual({
        city: trip.origin.name,
        utcOffsetMin: trip.origin.utcOffsetMin,
      });
    }
    expect(dayPlace(trip, 4)).toEqual({
      city: trip.destination.name,
      utcOffsetMin: trip.destination.utcOffsetMin,
    });
  });
});

describe("nowMinOnDay", () => {
  test("returns local minutes at the day's place", () => {
    const now = new Date("2026-10-18T12:00:00Z"); // 720 UTC min
    expect(nowMinOnDay(trip, 0, now)).toBe(720 + trip.origin.utcOffsetMin); // 13:00 London
    expect(nowMinOnDay(trip, 4, now)).toBe((720 + trip.destination.utcOffsetMin) % 1440); // 21:00 Tokyo
  });
});

describe("todayDayIndex", () => {
  test("returns the index whose spec.date is today at that day's place", () => {
    // 12:00Z on 15 Oct → 13:00 in London (day 0, D-3).
    expect(todayDayIndex(trip, new Date("2026-10-15T12:00:00Z"))).toBe(0);
    // 10:00Z on 19 Oct → 19:00 in Tokyo (day 4, D+1).
    expect(todayDayIndex(trip, new Date("2026-10-19T10:00:00Z"))).toBe(4);
  });

  test("returns null when no trip day is today", () => {
    expect(todayDayIndex(trip, new Date("2026-11-15T12:00:00Z"))).toBeNull();
    expect(todayDayIndex(trip, new Date("2026-10-01T12:00:00Z"))).toBeNull();
  });
});

describe("pickNextStep", () => {
  const a = nudge("a", 8 * 60, 9 * 60);
  const b = nudge("b", 10 * 60, 11 * 60);

  test("before all windows: next is the first step, nothing missed", () => {
    const r = pickNextStep([a, b], new Set(), 7 * 60);
    expect(r.next?.id).toBe("a");
    expect(r.missed).toEqual([]);
    expect(r.upcoming.map((n) => n.id)).toEqual(["b"]);
  });

  test("mid-window: the current step is next, not missed", () => {
    const r = pickNextStep([a, b], new Set(), 8 * 60 + 30);
    expect(r.next?.id).toBe("a");
    expect(r.missed).toEqual([]);
  });

  test("after a window: the elapsed step is missed, next is the upcoming one", () => {
    const r = pickNextStep([a, b], new Set(), 9 * 60 + 30);
    expect(r.missed.map((n) => n.id)).toEqual(["a"]);
    expect(r.next?.id).toBe("b");
  });

  test("a window crossing midnight is not missed late that evening", () => {
    const sleep = nudge("sleep", 21 * 60 + 45, 4 * 60 + 35); // 21:45 → 04:35
    const r = pickNextStep([sleep], new Set(), 23 * 60);
    expect(r.missed).toEqual([]);
    expect(r.next?.id).toBe("sleep");
  });

  test("all completed: next is undefined", () => {
    const r = pickNextStep([a, b], new Set(["a", "b"]), 12 * 60);
    expect(r.next).toBeUndefined();
    expect(r.missed).toEqual([]);
    expect(r.upcoming).toEqual([]);
  });

  test("nowMin null (not today): nothing missed, next is first incomplete", () => {
    const r = pickNextStep([a, b], new Set(["a"]), null);
    expect(r.missed).toEqual([]);
    expect(r.next?.id).toBe("b");
    expect(r.upcoming).toEqual([]);
  });
});

describe("shiftLockedPct", () => {
  test("is positive for an eastbound trip with negative shiftMin days", () => {
    const pct = shiftLockedPct(trip, [lockedDay(-120), lockedDay(-120)]);
    expect(pct).toBe(50); // |−240| / 480
  });

  test("is 0 with no locked days", () => {
    expect(shiftLockedPct(trip, [])).toBe(0);
  });

  test("caps at 100", () => {
    expect(shiftLockedPct(trip, [lockedDay(-200), lockedDay(-200), lockedDay(-200)])).toBe(100);
  });

  test("pre-lock with a preview shows the plan's promise, not 0", () => {
    // Same rule as heroMeeting's previewLocked (Dev B, round 3): before
    // anything is locked the first impression is what the crew would bank
    // today. Demo preview banks −180 of −480 → 38%.
    expect(shiftLockedPct(trip, [], [{ shiftMin: -90 }, { shiftMin: -90 }])).toBe(38);
  });

  test("post-lock the preview is ignored — locked wins", () => {
    expect(
      shiftLockedPct(trip, [lockedDay(-120)], [{ shiftMin: -480 }]),
    ).toBe(25); // |−120| / 480, not the preview's 100
  });
});

describe("previewLockedOf", () => {
  const solved = (shiftMin: number) => ({
    plan: lockedDay(shiftMin),
    result: {} as never,
  });

  test("drops null days so contracts see only what would lock", () => {
    const preview = new Map([
      ["D-3", solved(-90)],
      ["D-2", null],
      ["D-1", solved(-90)],
    ]);
    expect(previewLockedOf(preview)).toEqual([{ shiftMin: -90 }, { shiftMin: -90 }]);
  });

  test("null preview stays undefined — callers keep the equal-values shape", () => {
    expect(previewLockedOf(null)).toBeUndefined();
    expect(previewLockedOf(undefined)).toBeUndefined();
  });

  test("agrees with heroMeeting's inline extraction on the demo preview", async () => {
    // Same chain A's render threads into heroMeeting — one extractor, one array.
    const { previewPlan } = await import("../src/domain/solver");
    const { ADHERENCE_PROFILE, GARMIN_BASELINE, calendarFor } = await import("../src/domain/fixtures");
    const plan = previewPlan({
      trip,
      calendar: calendarFor(trip),
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    const extracted = previewLockedOf(plan);
    expect(extracted!.length).toBeGreaterThan(0);
    expect(extracted).toEqual(
      [...plan.values()].flatMap((d) => (d ? [{ shiftMin: d.plan.shiftMin }] : [])),
    );
  });
});

describe("heroReadiness", () => {
  test("pre-lock with a preview claims preview provenance, not locked", () => {
    const r = heroReadiness(trip, [], [{ shiftMin: -90 }, { shiftMin: -90 }]);
    expect(r).toEqual({ pct: 38, source: "preview" });
  });

  test("post-lock claims locked even when the preview promises more", () => {
    const r = heroReadiness(trip, [lockedDay(-120)], [{ shiftMin: -480 }]);
    expect(r).toEqual({ pct: 25, source: "locked" });
  });

  test("nothing locked and no preview is honestly none, not 0%-locked", () => {
    expect(heroReadiness(trip, [])).toEqual({ pct: 0, source: "none" });
    expect(heroReadiness(trip, [], [])).toEqual({ pct: 0, source: "none" });
  });
});
