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
 *  `locked` is `[]` pre-run. Without a preview both halves are the full
 *  unbanked gap; with `previewLocked` (what the crew would lock today) the
 *  `bodyMin` half is the with-plan clock and `bodyWithoutPlanMin` stays the
 *  full gap — that delta is the sales line. Post-lock the preview is ignored
 *  and the delta is locked-vs-unbanked. */
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
  /** Pre-run preview of what the crew would lock (from `previewPlan`). When
   *  `locked` is empty the hero uses this for `bodyMin` so the pre-lock sales
   *  line has an honest with-plan half; `bodyWithoutPlanMin` stays the full
   *  unbanked gap. Ignored once anything is locked. Optional so existing
   *  callers and tests without a preview keep the current equal-values shape. */
  previewLocked?: { shiftMin: number }[];
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
  // Pre-lock the crew hasn't banked anything yet, so `locked` is [] and both
  // halves would collapse to the full gap. The preview is what the crew would
  // lock today — the honest with-plan half of the sales line. Once anything
  // is really locked the preview is ignored.
  const effectiveForPlan =
    locked.length > 0
      ? locked
      : (input.previewLocked ?? locked);
  const lag = remainingLagMin(
    trip,
    effectiveForPlan as import("./types").DayPlan[],
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
