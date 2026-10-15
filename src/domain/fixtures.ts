import type {
  AdherenceProfile,
  CalendarEvent,
  City,
  Trip,
  WearableBaseline,
} from "./types";

// Demo persona: Alex flies London -> Tokyo Saturday morning, 9 time zones
// east. The crew gets D-3, D-2, D-1 pre-flight plus arrival days.
//
// shiftMin convention: negative = phase advance (earlier), positive = delay.

export const LONDON: City = { code: "LHR", name: "London", utcOffsetMin: 0, lon: -0.1276, lat: 51.5 };
export const TOKYO: City = { code: "HND", name: "Tokyo", utcOffsetMin: 540, lon: 139.69, lat: 35.7 };

export const DEMO_TRIP: Trip = {
  origin: LONDON,
  destination: TOKYO,
  requiredShiftMin: -540, // 9h advance
  departureDayIndex: 3,
  direction: "east",
  days: [
    { dayIndex: 0, label: "D-3", date: "2026-10-15" },
    { dayIndex: 1, label: "D-2", date: "2026-10-16" },
    { dayIndex: 2, label: "D-1", date: "2026-10-17" },
    { dayIndex: 3, label: "Flight", date: "2026-10-18" },
    { dayIndex: 4, label: "D+1", date: "2026-10-19" },
  ],
};

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
