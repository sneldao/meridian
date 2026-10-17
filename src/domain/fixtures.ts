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
export interface TripHorizon {
  /** Days shown before the flight — the consumer page defaults to
   *  min(3, days remaining). 0 = departs today. */
  preFlightDays?: number;
  /** Days shown after the flight — sized to the residual shift, bounded. */
  postFlightDays?: number;
}

export function buildTrip(originCode: CityCode, destCode: CityCode, departureDate: string, horizon: TripHorizon = {}): Trip {
  const pre = horizon.preFlightDays ?? 3;
  const post = horizon.postFlightDays ?? 1;
  const flight = new Date(departureDate + "T00:00:00Z");
  const labels: string[] = [];
  for (let i = pre; i >= 1; i--) labels.push(`D-${i}`);
  labels.push("Flight");
  for (let i = 1; i <= post; i++) labels.push(`D+${i}`);
  const days = labels.map((label, i) => {
    const d = new Date(flight);
    d.setUTCDate(d.getUTCDate() + (i - pre));
    return { dayIndex: i, label, date: d.toISOString().slice(0, 10) };
  });
  const origin = cityOn(originCode, days[0].date);
  const destination = cityOn(destCode, days[days.length - 1].date);
  const requiredShiftMin = wrapShiftMin(origin.utcOffsetMin - destination.utcOffsetMin); // negative = eastward advance
  const direction: Trip["direction"] = requiredShiftMin <= 0 ? "east" : "west";
  return {
    origin,
    destination,
    requiredShiftMin,
    departureDayIndex: pre,
    direction,
    days,
  };
}

export const DEMO_TRIP: Trip = buildTrip("LHR", "HND", DEMO_DEPARTURE);

/** The fixture calendar with the flight retitled for the trip's route. */
export function calendarFor(trip: Trip): CalendarEvent[] {
  // Events are stored on the canonical 5-day shape (departureDayIndex 3);
  // re-anchor them to this trip's flight day so pre-flight events stay
  // relative to departure and the D+1 commitment lands the day after.
  const shift = trip.departureDayIndex - 3;
  return CALENDAR.map((e) => {
    const dayIndex = e.dayIndex + shift;
    if (dayIndex < 0 || dayIndex >= trip.days.length) return null;
    const moved = { ...e, dayIndex };
    return e.id === "ev-flight"
      ? { ...moved, title: `Flight ${trip.origin.code} → ${trip.destination.code}` }
      : moved;
  }).filter((e): e is CalendarEvent => e !== null);
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

/** The one consumer personalisation question (consumer-appeal): the wearer's
 * natural wake anchor. Missing → the fixture profile, sample tag stays. */
export type WakeBand = "before6" | "6to8" | "after8";

export const WAKE_BAND_ANCHORS: Record<WakeBand, { wakeMin: number; chronotype: WearableBaseline["chronotype"] }> = {
  before6: { wakeMin: 5 * 60 + 45, chronotype: "early" },
  "6to8": { wakeMin: 6 * 60 + 45, chronotype: "neutral" },
  after8: { wakeMin: 8 * 60, chronotype: "late" },
};

/** Merges a self-reported wake band over a baseline. Keeps the same sleep
 * duration; bedtime follows the wake anchor. Returns `base` unchanged when
 * the question was skipped — never invents a profile. */
export function resolveBaseline(band: WakeBand | null | undefined, base: WearableBaseline = GARMIN_BASELINE): WearableBaseline {
  if (!band || !(band in WAKE_BAND_ANCHORS)) return base;
  const { wakeMin, chronotype } = WAKE_BAND_ANCHORS[band];
  return {
    ...base,
    avgWakeMin: wakeMin,
    avgBedtimeMin: (((wakeMin + base.avgSleepMin - 1440) % 1440) + 1440) % 1440,
    chronotype,
    source: `${base.source} + self-report`,
  };
}

/** Horizon for a *live* trip: pre-flight capped by days actually left
 * (depart tomorrow → 1 pre-flight day), post-flight sized to the shift
 * owed after the ~90 min/day floor-capped bank, bounded 1–5. Callers that
 * don't pass it (tests, replay, DEMO_TRIP) keep the canonical 5-day shape. */
export function horizonFor(requiredShiftMin: number, daysUntilDeparture: number): Required<TripHorizon> {
  const pre = Math.min(3, Math.max(0, daysUntilDeparture));
  const owed = Math.max(0, Math.abs(requiredShiftMin) - 90);
  const post = Math.min(5, Math.max(1, Math.ceil(owed / 60)));
  return { preFlightDays: pre, postFlightDays: post };
}

/** Neutral traveller calendar for any route — generic commitments, no
 * demo names. The canonical `CALENDAR`/`calendarFor` stays Alex-flavoured
 * for DEMO_TRIP, tests and replay; the consumer path gets this when the
 * route isn't the demo's and no real calendar is connected. */
export function neutralCalendarFor(trip: Trip): CalendarEvent[] {
  const dep = trip.departureDayIndex;
  const out: CalendarEvent[] = [];
  trip.days.forEach((d, i) => {
    if (i === dep) {
      out.push({ id: "n-flight", title: `Flight ${trip.origin.code} → ${trip.destination.code}`, dayIndex: i, startMin: 11 * 60 + 20, endMin: 11 * 60 + 50, movable: false, blocksInterventions: false });
      return;
    }
    if (i > dep) {
      if (i === dep + 1) out.push({ id: "n-arrival-mtg", title: "Client meeting", dayIndex: i, startMin: 14 * 60, endMin: 15 * 60 + 30, movable: false });
      return;
    }
    out.push({ id: `n-standup-${i}`, title: "Team standup", dayIndex: i, startMin: 9 * 60 + 30, endMin: 10 * 60, movable: true });
    out.push({ id: `n-deep-${i}`, title: "Deep work", dayIndex: i, startMin: 14 * 60, endMin: 16 * 60, movable: true });
    if (i === 0) out.push({ id: "n-review", title: "Weekly review", dayIndex: i, startMin: 9 * 60, endMin: 10 * 60 + 30, movable: false });
    if (i === dep - 1) out.push({ id: "n-dinner", title: "Dinner", dayIndex: i, startMin: 19 * 60 + 30, endMin: 21 * 60 + 30, movable: false });
  });
  return out;
}
