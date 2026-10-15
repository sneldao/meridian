import type {
  AdherenceProfile,
  CalendarEvent,
  City,
  CityCode,
  Trip,
  WearableBaseline,
} from "./types";

import { cityOn, findAirport } from "./airports";
import { wrapShiftMin } from "./timezones";

// Demo persona: Alex flies London -> Tokyo Sunday 18 Oct 2026. London is on
// BST (UTC+1) until 25 Oct, so that's 8 time zones east, not 9. The crew gets
// D-3, D-2, D-1 pre-flight plus arrival days.
//
// shiftMin convention: negative = phase advance (earlier), positive = delay.

export const DEMO_DEPARTURE = "2026-10-18";

/** Featured routes for quick picks; any IATA code in src/data/airports.json works. */
export const FEATURED_CODES = ["LHR", "HND", "JFK", "SFO", "CDG", "SIN"] as const;

/** Featured cities with offsets on the demo dates. Prefer `cityOn(code, date)`. */
export const CITY_TABLE: Record<CityCode, City> = Object.fromEntries(
  FEATURED_CODES.map((c) => [c, cityOn(c, DEMO_DEPARTURE)]),
);

export const LONDON: City = CITY_TABLE.LHR;
export const TOKYO: City = CITY_TABLE.HND;

export function isKnownCity(code: string | null | undefined): code is CityCode {
  return !!findAirport(code);
}

/**
 * Build a trip for any two airports. Offsets are evaluated on real dates
 * (home on D-3, destination on arrival), and the shift wraps into ±12 h so
 * SFO → SIN is an 8 h delay, not a 16 h advance.
 */
export function buildTrip(originCode: CityCode, destCode: CityCode, departureDate: string): Trip {
  const flight = new Date(departureDate + "T00:00:00Z");
  const days = ["D-3", "D-2", "D-1", "Flight", "D+1"].map((label, i) => {
    const d = new Date(flight);
    d.setUTCDate(d.getUTCDate() + (i - 3));
    return { dayIndex: i, label, date: d.toISOString().slice(0, 10) };
  });
  const origin = cityOn(originCode, days[0].date);
  const destination = cityOn(destCode, days[4].date);
  const requiredShiftMin = wrapShiftMin(origin.utcOffsetMin - destination.utcOffsetMin); // negative = eastward advance
  const direction: Trip["direction"] = requiredShiftMin <= 0 ? "east" : "west";
  return {
    origin,
    destination,
    requiredShiftMin,
    departureDayIndex: 3,
    direction,
    days,
  };
}

export const DEMO_TRIP: Trip = buildTrip("LHR", "HND", DEMO_DEPARTURE);

/** The fixture calendar with the flight retitled for the trip's route. */
export function calendarFor(trip: Trip): CalendarEvent[] {
  return CALENDAR.map((e) =>
    e.id === "ev-flight" ? { ...e, title: `Flight ${trip.origin.code} → ${trip.destination.code}` } : { ...e },
  );
}

export const GARMIN_BASELINE: WearableBaseline = {
  wearer: "Alex Rivera",
  source: "Garmin Fenix 8",
  avgBedtimeMin: 23 * 60 + 55,
  avgWakeMin: 6 * 60 + 45,
  avgSleepMin: 410,
  hrvMs: 48,
  hrvTrend: "stable",
  restingHr: 58,
  chronotype: "late",
  nights: [
    { date: "2026-10-10", bedtimeMin: 23 * 60 + 40, wakeMin: 6 * 60 + 50, sleepMin: 400, hrvMs: 46 },
    { date: "2026-10-11", bedtimeMin: 24 * 60 + 10, wakeMin: 7 * 60 + 5, sleepMin: 385, hrvMs: 47 },
    { date: "2026-10-12", bedtimeMin: 23 * 60 + 50, wakeMin: 6 * 60 + 40, sleepMin: 420, hrvMs: 49 },
    { date: "2026-10-13", bedtimeMin: 24 * 60 + 5, wakeMin: 6 * 60 + 45, sleepMin: 395, hrvMs: 48 },
    { date: "2026-10-14", bedtimeMin: 23 * 60 + 58, wakeMin: 6 * 60 + 42, sleepMin: 415, hrvMs: 50 },
  ],
};

export const ADHERENCE_PROFILE: AdherenceProfile = {
  ignoresInterventionsBeforeMin: 7 * 60,
  strongAt: ["evening actions", "calendar-driven blocks", "single daily asks"],
  weakAt: ["early alarms", "self-directed naps", "multi-step morning routines"],
};

export const CALENDAR: CalendarEvent[] = [
  // Fixed commitments — the negotiator routes around these.
  { id: "ev-board", title: "Board meeting", dayIndex: 0, startMin: 9 * 60, endMin: 10 * 60 + 30, movable: false },
  { id: "ev-breakfast", title: "Team breakfast", dayIndex: 1, startMin: 7 * 60 + 30, endMin: 8 * 60 + 30, movable: false },
  { id: "ev-dinner", title: "Dinner with Sarah", dayIndex: 2, startMin: 19 * 60 + 30, endMin: 21 * 60 + 30, movable: false },
  { id: "ev-flight", title: "BA005 LHR → HND", dayIndex: 3, startMin: 11 * 60 + 20, endMin: 11 * 60 + 50, movable: false, blocksInterventions: false },
  // The reason for the trip: the destination meeting the readiness badge judges.
  // 14:00 local on arrival day: LHR→HND unadapted, the body thinks it's 06:00.
  { id: "ev-pitch", title: "Client pitch", dayIndex: 4, startMin: 14 * 60, endMin: 15 * 60 + 30, movable: false },
  // Movable blocks — negotiable material.
  { id: "ev-standup-0", title: "Team standup", dayIndex: 0, startMin: 9 * 60 + 30, endMin: 10 * 60, movable: true },
  { id: "ev-standup-1", title: "Team standup", dayIndex: 1, startMin: 9 * 60 + 30, endMin: 10 * 60, movable: true },
  { id: "ev-standup-2", title: "Team standup", dayIndex: 2, startMin: 9 * 60 + 30, endMin: 10 * 60, movable: true },
  { id: "ev-gym-0", title: "Gym", dayIndex: 0, startMin: 18 * 60, endMin: 19 * 60, movable: true },
  { id: "ev-gym-1", title: "Gym", dayIndex: 1, startMin: 18 * 60, endMin: 19 * 60, movable: true },
  { id: "ev-deep-0", title: "Deep work", dayIndex: 0, startMin: 14 * 60, endMin: 16 * 60, movable: true },
  { id: "ev-deep-1", title: "Deep work", dayIndex: 1, startMin: 14 * 60, endMin: 16 * 60, movable: true },
  { id: "ev-pack", title: "Pack + drop bags", dayIndex: 2, startMin: 16 * 60, endMin: 17 * 60 + 30, movable: true },
];
