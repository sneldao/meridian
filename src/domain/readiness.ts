import { fmtMin } from "./circadian";
import type { CalendarEvent, DayPlan, Trip } from "./types";

// Meeting readiness — the on-screen return. For each destination meeting the
// body clock is local time minus the shift still outstanding. A meeting that
// lands in the body's low point (02:00–06:00 body time) is flagged at risk,
// and the suggested local time puts the body near mid-afternoon instead.
// Deterministic: the same plan and calendar always give the same badges.

const DAY_MIN = 1440;
export const LOW_POINT_START_MIN = 2 * 60;
export const LOW_POINT_END_MIN = 6 * 60;
export const TARGET_BODY_MIN = 14 * 60;

const wrap = (min: number) => ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;

/** Minutes the body clock still lags destination time after the locked days.
 * Never negative: once the shift is covered the body is on destination time. */
export function remainingLagMin(trip: Trip, locked: DayPlan[]): number {
  const required = Math.abs(trip.requiredShiftMin);
  const sign = trip.direction === "east" ? -1 : 1; // east plans have negative shiftMin
  const covered = locked.reduce((acc, d) => acc + sign * d.shiftMin, 0);
  return Math.max(0, required - covered);
}

/** Body clock time, given local destination time and the outstanding lag. */
export function bodyClockMin(localMin: number, lagMin: number): number {
  return wrap(localMin - lagMin);
}

export interface MeetingReadiness {
  eventId: string;
  title: string;
  dayIndex: number;
  localMin: number;
  bodyMin: number;
  status: "ready" | "risk";
  /** Local start that puts the body near TARGET_BODY_MIN. Set only when at risk. */
  suggestedLocalMin?: number;
  /** One line a buyer can read, e.g. "Board meeting D+1 09:00 — your body thinks it's 02:00. Rex suggests 14:00." */
  text: string;
}

/** Readiness for every meeting after the flight. Moved events use their new slot. */
export function meetingReadiness(
  trip: Trip,
  events: CalendarEvent[],
  locked: DayPlan[],
): MeetingReadiness[] {
  const lag = remainingLagMin(trip, locked);
  return events
    .filter((e) => (e.movedTo?.dayIndex ?? e.dayIndex) > trip.departureDayIndex)
    .map((e) => {
      const dayIndex = e.movedTo?.dayIndex ?? e.dayIndex;
      const localMin = e.movedTo?.startMin ?? e.startMin;
      const bodyMin = bodyClockMin(localMin, lag);
      const atRisk = bodyMin >= LOW_POINT_START_MIN && bodyMin < LOW_POINT_END_MIN;
      const label = trip.days[dayIndex]?.label ?? `day ${dayIndex}`;
      const head = `${e.title} ${label} ${fmtMin(localMin)}`;
      if (!atRisk) {
        return {
          eventId: e.id,
          title: e.title,
          dayIndex,
          localMin,
          bodyMin,
          status: "ready" as const,
          text: `${head} — your body thinks it's ${fmtMin(bodyMin)}. Ready.`,
        };
      }
      const suggestedLocalMin = wrap(TARGET_BODY_MIN + lag);
      return {
        eventId: e.id,
        title: e.title,
        dayIndex,
        localMin,
        bodyMin,
        status: "risk" as const,
        suggestedLocalMin,
        text: `${head} — your body thinks it's ${fmtMin(bodyMin)}. Rex suggests ${fmtMin(suggestedLocalMin)}.`,
      };
    });
}
