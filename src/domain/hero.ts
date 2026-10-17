import { bodyClockMin, isAsleep, remainingLagMin, sleepWindow } from "./readiness";
import type { CalendarEvent, Trip, WearableBaseline } from "./types";
import { GARMIN_BASELINE } from "./fixtures";

/** The B-shape for item 13: movable/fixed counts + readiness label, computed
 *  from data that already exists in `TripSetupScreen` — A renders it above
 *  the timeline. Pure so it can be asserted. */
export interface CalendarSummary {
  movable: number;
  fixed: number;
  ready: number;
  total: number;
  readinessLabel: string;
}

export function calendarSummary(
  calendar: CalendarEvent[],
  readiness: { status: string }[],
): CalendarSummary {
  const movable = calendar.filter((e) => e.movable).length;
  const fixed = calendar.length - movable;
  const ready = readiness.filter((r) => r.status === "ready").length;
  return {
    movable,
    fixed,
    ready,
    total: readiness.length,
    readinessLabel: readiness.length > 0 ? `${ready}/${readiness.length}` : "—",
  };
}

/** The B-shape for item 15: the one fixed post-flight event with attendees
 *  the hero names under the residual. `null` when there is nothing worth
 *  naming — A renders nothing rather than a fixture title. Fixtures carry no
 *  attendee field, so "fixed + post-flight + not the flight itself" is the
 *  proxy; a real Google event with attendees always wins the tiebreak by
 *  being the only fixed wall on its day.
 *
 *  `locked` is `[]` pre-run: body time is unadapted and the `→ locked`
 *  delta is the full honest gap (`bodyWithoutPlan` vs `bodyWithPlan`). */
export interface HeroMeeting {
  eventId: string;
  title: string;
  dayLabel: string;
  /** Destination-local start, for the hero line. */
  localMin: number;
  /** Body clock at start with the locked plan applied. */
  bodyMin: number;
  /** Body clock at start with no plan — the "without Meridian" half. */
  bodyWithoutPlanMin: number;
  status: "ready" | "risk";
}

export function heroMeeting(input: {
  trip: Trip;
  calendar: CalendarEvent[];
  locked: { shiftMin: number }[];
  baseline?: WearableBaseline;
}): HeroMeeting | null {
  const { trip, calendar, locked } = input;
  const isFlight = (title: string) =>
    /\b[A-Z]{3}\s*(?:→|->|-)\s*[A-Z]{3}\b/.test(title) || /\bflights?\b/i.test(title);
  const candidates = calendar.filter(
    (e) =>
      (e.movedTo?.dayIndex ?? e.dayIndex) > trip.departureDayIndex &&
      !e.movable &&
      !isFlight(e.title),
  );
  if (!candidates.length) return null;
  // Earliest post-flight day, then earliest start — the pitch, not a dinner.
  const ev = [...candidates].sort(
    (a, b) =>
      (a.movedTo?.dayIndex ?? a.dayIndex) - (b.movedTo?.dayIndex ?? b.dayIndex) ||
      (a.movedTo?.startMin ?? a.startMin) - (b.movedTo?.startMin ?? b.startMin),
  )[0];
  const dayIndex = ev.movedTo?.dayIndex ?? ev.dayIndex;
  const localMin = ev.movedTo?.startMin ?? ev.startMin;
  const lag = remainingLagMin(
    trip,
    locked as import("./types").DayPlan[],
  );
  const fullLag = remainingLagMin(trip, []);
  const bodyMin = bodyClockMin(localMin, lag, trip.direction);
  const bodyWithoutPlanMin = bodyClockMin(localMin, fullLag, trip.direction);
  const window = sleepWindow(input.baseline ?? GARMIN_BASELINE);
  return {
    eventId: ev.id,
    title: ev.title,
    dayLabel: trip.days[dayIndex]?.label ?? `day ${dayIndex}`,
    localMin,
    bodyMin,
    bodyWithoutPlanMin,
    status: isAsleep(bodyMin, window) ? "risk" : "ready",
  };
}
