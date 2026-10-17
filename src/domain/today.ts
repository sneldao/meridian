import type { TravelerNudge } from "./nudges";
import type { DayPlan, Trip } from "./types";

// "Today" helpers — which trip day is now, what time it is there, and which
// step comes next. Pure functions: the feed calls them with `new Date()`;
// tests call them with fixed dates. Times are always local to the place the
// day is experienced (dayPlace), never the viewer's device timezone.

const DAY_MIN = 1440;
const wrap = (m: number) => ((m % DAY_MIN) + DAY_MIN) % DAY_MIN;

/** Where the day is experienced: days up to and including the flight day are
 *  origin-local (the flight departs from home); days after are
 *  destination-local. Matches how the solver and fixtures treat flight-day
 *  minutes (ev-flight on the departure day is origin-local; the first
 *  post-flight day's events are destination-local). */
export function dayPlace(trip: Trip, dayIndex: number): { city: string; utcOffsetMin: number } {
  const place = dayIndex <= trip.departureDayIndex ? trip.origin : trip.destination;
  return { city: place.name, utcOffsetMin: place.utcOffsetMin };
}

/** Minutes since local midnight at the place `dayIndex` is experienced. */
export function nowMinOnDay(trip: Trip, dayIndex: number, now: Date): number {
  const { utcOffsetMin } = dayPlace(trip, dayIndex);
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  return wrap(utcMin + utcOffsetMin);
}

/** Which trip day is "today" — the day whose spec.date equals the local date
 *  at that day's place. null when no trip day is today (trip fully past or
 *  not started). */
export function todayDayIndex(trip: Trip, now: Date): number | null {
  for (const spec of trip.days) {
    const { utcOffsetMin } = dayPlace(trip, spec.dayIndex);
    const local = new Date(now.getTime() + utcOffsetMin * 60000).toISOString().slice(0, 10);
    if (local === spec.date) return spec.dayIndex;
  }
  return null;
}

/** The one thing to do now. Steps are ordered by startMin. When nowMin is
 *  null (the selected day isn't today) nothing counts as missed: next is the
 *  first incomplete step. Otherwise a step is missed iff it is incomplete and
 *  its window has already ended (endMin < startMin means the window crosses
 *  midnight); next is the first incomplete step still inside or ahead of its
 *  window, and upcoming is the rest. */
export function pickNextStep(
  nudges: TravelerNudge[],
  completed: Set<string>,
  nowMin: number | null,
): { next?: TravelerNudge; missed: TravelerNudge[]; upcoming: TravelerNudge[] } {
  const sorted = [...nudges].sort((a, b) => a.startMin - b.startMin);
  const incomplete = sorted.filter((n) => !completed.has(n.id));
  if (nowMin === null) {
    const [next, ...upcoming] = incomplete;
    return { next, missed: [], upcoming };
  }
  const missedSet = new Set(
    incomplete
      .filter((n) => {
        const end = n.endMin < n.startMin ? n.endMin + DAY_MIN : n.endMin;
        return nowMin >= end;
      })
      .map((n) => n.id),
  );
  const live = incomplete.filter((n) => !missedSet.has(n.id));
  const [next, ...upcoming] = live;
  return { next, missed: sorted.filter((n) => missedSet.has(n.id)), upcoming };
}

/** How much of the trip's required shift the locked days cover, 0–100.
 *  Sign-safe: east plans shift negative, so both sides take abs — the old
 *  signed division went negative for every eastbound trip.
 *
 *  Pre-lock expansion (Dev B, round 3): `previewLocked` is what the crew
 *  *would* lock today (from `previewPlan`). When `locked` is empty the hero
 *  uses the preview so the first impression shows the plan's promise
 *  ("38% banked on preview") instead of 0%; once anything is really locked
 *  the preview is ignored. Optional so existing callers keep the 0 shape. */
export function shiftLockedPct(
  trip: Trip,
  locked: DayPlan[],
  previewLocked?: Pick<DayPlan, "shiftMin">[],
): number {
  const required = Math.abs(trip.requiredShiftMin);
  if (required === 0) return 0;
  const effective =
    locked.length > 0 ? locked : (previewLocked ?? locked);
  const covered = Math.abs(effective.reduce((acc, d) => acc + d.shiftMin, 0));
  return Math.min(100, Math.round((covered / required) * 100));
}
