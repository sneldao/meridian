import { fmtMin } from "./circadian";
import { GARMIN_BASELINE } from "./fixtures";
import type { CalendarEvent, DayPlan, Trip, WearableBaseline } from "./types";

// Meeting readiness — the on-screen return. Body time is where the body clock
// is when the meeting starts. East, the body is behind local time, so the lag
// subtracts. West, the body is ahead, so the lag adds. A meeting is at risk
// when the body is inside the wearer's habitual sleep window (bed to wake,
// padded by 45 minutes each side). Suggestions are the earliest business-hours
// slot where the body is awake, or "move to D+2" if no slot works.
// Deterministic: the same plan, calendar and baseline give the same badges.

const DAY_MIN = 1440;
export const SLEEP_PAD_MIN = 45;
export const BUSINESS_START_MIN = 10 * 60;
export const BUSINESS_END_MIN = 17 * 60;
export const SLOT_MIN = 30;

const wrap = (min: number) => ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;

/** Minutes the body clock still differs from destination time after the locked days.
 * Never negative: once the shift is covered the body is on destination time. */
export function remainingLagMin(trip: Trip, locked: DayPlan[]): number {
  const required = Math.abs(trip.requiredShiftMin);
  const sign = trip.direction === "east" ? -1 : 1; // east plans have negative shiftMin
  const covered = locked.reduce((acc, d) => acc + sign * d.shiftMin, 0);
  return Math.max(0, required - covered);
}

/** Body clock time for a local destination time. East: body is behind, subtract.
 * West: body is ahead, add. */
export function bodyClockMin(localMin: number, lagMin: number, direction: Trip["direction"]): number {
  return wrap(direction === "east" ? localMin - lagMin : localMin + lagMin);
}

export interface SleepWindow {
  start: number;
  end: number;
}

/** The wearer's habitual sleep window, padded on both sides. */
export function sleepWindow(baseline: WearableBaseline = GARMIN_BASELINE): SleepWindow {
  return {
    start: wrap(baseline.avgBedtimeMin - SLEEP_PAD_MIN),
    end: wrap(baseline.avgWakeMin + SLEEP_PAD_MIN),
  };
}

/** Whether a body-clock time falls inside the window. The window may wrap midnight. */
export function isAsleep(bodyMin: number, window: SleepWindow): boolean {
  const m = wrap(bodyMin);
  return window.start <= window.end
    ? m >= window.start && m <= window.end
    : m >= window.start || m <= window.end;
}

/** Earliest business-hours slot (local destination time) where the body is awake. */
export function suggestBusinessSlot(
  trip: Trip,
  lagMin: number,
  window: SleepWindow,
): number | null {
  for (let m = BUSINESS_START_MIN; m < BUSINESS_END_MIN; m += SLOT_MIN) {
    if (!isAsleep(bodyClockMin(m, lagMin, trip.direction), window)) return m;
  }
  return null;
}

export interface MeetingReadiness {
  eventId: string;
  title: string;
  dayIndex: number;
  localMin: number;
  /** Body clock at the meeting start, with the locked plan applied. */
  bodyMin: number;
  /** Body clock at the meeting start with no plan at all. */
  bodyWithoutPlanMin: number;
  status: "ready" | "risk";
  /** Business-hours slot on the same day that clears the sleep window. */
  suggestedLocalMin?: number;
  /** Set when no business-hours slot clears the sleep window. */
  moveToNextDay?: boolean;
  /** One line a buyer can read. */
  text: string;
}

/** Readiness for every meeting after the flight. Moved events use their new slot. */
export function meetingReadiness(
  trip: Trip,
  events: CalendarEvent[],
  locked: DayPlan[],
  baseline: WearableBaseline = GARMIN_BASELINE,
): MeetingReadiness[] {
  const lag = remainingLagMin(trip, locked);
  const fullLag = remainingLagMin(trip, []);
  const window = sleepWindow(baseline);
  const hasPlan = locked.length > 0;

  return events
    .filter((e) => (e.movedTo?.dayIndex ?? e.dayIndex) > trip.departureDayIndex)
    .map((e) => {
      const dayIndex = e.movedTo?.dayIndex ?? e.dayIndex;
      const localMin = e.movedTo?.startMin ?? e.startMin;
      const bodyMin = bodyClockMin(localMin, lag, trip.direction);
      const bodyWithoutPlanMin = bodyClockMin(localMin, fullLag, trip.direction);
      const atRisk = isAsleep(bodyMin, window);
      const label = trip.days[dayIndex]?.label ?? `day ${dayIndex}`;
      const head = `${e.title} ${label} ${fmtMin(localMin)}`;

      const base = {
        eventId: e.id,
        title: e.title,
        dayIndex,
        localMin,
        bodyMin,
        bodyWithoutPlanMin,
      };

      const beforeAfter =
        hasPlan && bodyWithoutPlanMin !== bodyMin
          ? `without Meridian your body thinks it's ${fmtMin(bodyWithoutPlanMin)}; with the plan, ${fmtMin(bodyMin)}`
          : `your body thinks it's ${fmtMin(bodyMin)}`;

      if (!atRisk) {
        return { ...base, status: "ready" as const, text: `${head} — ${beforeAfter}. Ready.` };
      }

      const slot = suggestBusinessSlot(trip, lag, window);
      if (slot === null) {
        return {
          ...base,
          status: "risk" as const,
          moveToNextDay: true,
          text: `${head} — ${beforeAfter}. No business-hours slot clears sleep; move to D+2.`,
        };
      }
      return {
        ...base,
        status: "risk" as const,
        suggestedLocalMin: slot,
        text: `${head} — ${beforeAfter}. Rex suggests ${fmtMin(slot)}.`,
      };
    });
}
