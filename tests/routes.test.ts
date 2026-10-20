import { describe, expect, test } from "bun:test";
import { replayPlanFor } from "../src/agents/replay-plan";
import { searchAirports, findAirport } from "../src/domain/airports";
import { evaluatePlan, passes } from "../src/domain/circadian";
import { ADHERENCE_PROFILE, DEMO_TRIP, GARMIN_BASELINE, buildTrip, calendarFor } from "../src/domain/fixtures";
import { utcOffsetMinOn, wrapShiftMin } from "../src/domain/timezones";
import { fallbackCitations } from "../src/tools/science";

describe("time zones", () => {
  test("DST: London is UTC+1 in mid-October 2026, UTC+0 after 25 Oct", () => {
    expect(utcOffsetMinOn("Europe/London", "2026-10-15")).toBe(60);
    expect(utcOffsetMinOn("Europe/London", "2026-10-26")).toBe(0);
    expect(utcOffsetMinOn("Asia/Tokyo", "2026-10-15")).toBe(540);
    expect(utcOffsetMinOn("Asia/Kolkata", "2026-10-15")).toBe(330);
  });

  test("wrap into (−12h, +12h]", () => {
    expect(wrapShiftMin(-960)).toBe(480);
    expect(wrapShiftMin(960)).toBe(-480);
    expect(wrapShiftMin(-720)).toBe(720);
    expect(wrapShiftMin(-480)).toBe(-480);
  });
});

describe("buildTrip", () => {
  test("LHR → HND this week is 8 h east, not 9", () => {
    const t = buildTrip("LHR", "HND", "2026-10-18");
    expect(t.requiredShiftMin).toBe(-480);
    expect(t.direction).toBe("east");
    expect(t.origin.tz).toBe("Europe/London");
    expect(DEMO_TRIP.requiredShiftMin).toBe(-480);
  });

  test("LHR → HND in winter is 9 h", () => {
    expect(buildTrip("LHR", "HND", "2026-12-10").requiredShiftMin).toBe(-540);
  });

  test("SFO → SIN wraps to an 8 h delay, not a 16 h advance", () => {
    const t = buildTrip("SFO", "SIN", "2026-12-10");
    expect(t.requiredShiftMin).toBe(480);
    expect(t.direction).toBe("west");
  });

  test("any airport works, including half-hour zones", () => {
    const t = buildTrip("LHR", "DEL", "2026-12-10");
    expect(t.requiredShiftMin).toBe(-330);
  });
});

describe("airport search", () => {
  test("code, city and name matches", () => {
    expect(searchAirports("lhr")[0].code).toBe("LHR");
    expect(searchAirports("tokyo").map((a) => a.code)).toContain("HND");
    expect(searchAirports("heathrow")[0].code).toBe("LHR");
    expect(findAirport("jfk")?.tz).toBe("America/New_York");
  });
});

describe("route-aware replay plans", () => {
  const routes: [string, string, string][] = [
    ["LHR", "HND", "2026-10-18"],
    ["LHR", "JFK", "2026-10-18"],
    ["JFK", "LHR", "2026-10-18"],
    ["SFO", "SIN", "2026-12-10"],
    ["LHR", "DXB", "2026-10-18"],
    ["LHR", "DEL", "2026-10-18"],
    ["CDG", "LAX", "2026-10-18"],
    ["SYD", "LHR", "2026-10-18"],
    ["HND", "SFO", "2026-10-18"],
    ["LHR", "CDG", "2026-10-18"],
  ];

  for (const [o, d, date] of routes) {
    test(`${o} → ${d}: every day passes the real scorer; bad drafts fail`, () => {
      const trip = buildTrip(o, d, date);
      const cal = calendarFor(trip);
      const plan = replayPlanFor(trip, cal, fallbackCitations(), ADHERENCE_PROFILE);
      expect(plan.days).toHaveLength(trip.days.length);
      const locked = [];
      for (const day of plan.days) {
        const bad = plan.badFirstDrafts.get(day.dayIndex);
        if (bad) expect(passes(evaluatePlan({ trip, days: [...locked, bad], calendar: cal, adherence: ADHERENCE_PROFILE, baseline: GARMIN_BASELINE }))).toBe(false);
        // The baseline is part of the contract: the scorer reads the body's
        // phase from it, and the runtime always passes it. Judged without it,
        // the scorer anchors the light window on the schedule instead of the
        // body, and a plan the runtime would accept is rejected here.
        const r = evaluatePlan({ trip, days: [...locked, day], calendar: cal, adherence: ADHERENCE_PROFILE, baseline: GARMIN_BASELINE });
        expect(passes(r)).toBe(true);
        locked.push(day);
      }
      const shifted = plan.days.reduce((a, x) => a + Math.abs(x.shiftMin), 0);
      expect(shifted).toBeLessThanOrEqual(Math.abs(trip.requiredShiftMin));
      // Shifts all go the trip's way.
      for (const x of plan.days) if (x.shiftMin) expect(Math.sign(x.shiftMin)).toBe(trip.direction === "east" ? -1 : 1);
    });
  }
});
