import {
  PASS_SCORE,
  type AdherenceProfile,
  type CalendarEvent,
  type DayPlan,
  type EvalResult,
  type EvalViolation,
  type Trip,
} from "./types";

// Deterministic circadian model — the evaluator's ground truth.
// Agents propose; this code disposes. The constants encode well-supported
// physiology: ~90 min/day is a generous ceiling for endogenous phase shift,
// caffeine has a multi-hour half-life, and timed light is the dominant
// zeitgeber.

export const MAX_SHIFT_MIN_PER_DAY = 90;
export const CAFFEINE_CUTOFF_BEFORE_BED_MIN = 8 * 60;
export const MIN_SLEEP_MIN = 360;
export const LIGHT_ANCHOR_WINDOW_MIN = 120;

interface EvalInput {
  trip: Trip;
  days: DayPlan[];
  calendar: CalendarEvent[];
  adherence: AdherenceProfile;
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

export function evaluatePlan(input: EvalInput): EvalResult {
  const violations: EvalViolation[] = [];
  const notes: string[] = [];
  let adherencePenalty = 0;

  // --- Physiological feasibility -------------------------------------------
  input.days.forEach((day, i) => {
    if (Math.abs(day.shiftMin) > MAX_SHIFT_MIN_PER_DAY) {
      violations.push({
        code: "SHIFT_TOO_FAST",
        dayIndex: day.dayIndex,
        message: `${day.label}: ${Math.abs(day.shiftMin)}min shift exceeds the ${MAX_SHIFT_MIN_PER_DAY}min/day physiological ceiling.`,
      });
    }
    if (i > 0 && Math.sign(day.shiftMin) !== Math.sign(input.days[i - 1].shiftMin) && day.shiftMin !== 0) {
      violations.push({
        code: "SHIFT_DIRECTION_FLIP",
        dayIndex: day.dayIndex,
        message: `${day.label}: shift direction flips — the clock cannot yo-yo.`,
      });
    }

    const sleepMin =
      (1440 - day.targetBedtimeMin + day.targetWakeMin) % 1440 || 1440;
    if (sleepMin < MIN_SLEEP_MIN) {
      violations.push({
        code: "SLEEP_TOO_SHORT",
        dayIndex: day.dayIndex,
        message: `${day.label}: ${Math.round(sleepMin / 60)}h sleep is under the ${MIN_SLEEP_MIN / 60}h floor.`,
      });
    }

    // Timed light must anchor near the advancing wake target (advancing east).
    const hasLight = day.interventions.some((iv) => iv.kind === "light_exposure");
    if (day.shiftMin < 0 && !hasLight) {
      violations.push({
        code: "MISSING_LIGHT_ANCHOR",
        dayIndex: day.dayIndex,
        message: `${day.label}: advancing the clock needs a morning light anchor.`,
      });
    }
    for (const iv of day.interventions) {
      if (iv.kind === "light_exposure" && day.shiftMin < 0) {
        const gap = Math.abs(iv.startMin - day.targetWakeMin);
        if (gap > LIGHT_ANCHOR_WINDOW_MIN) {
          violations.push({
            code: "LIGHT_WRONG_WINDOW",
            dayIndex: day.dayIndex,
            message: `${day.label}: light at ${fmtMin(iv.startMin)} is ${Math.round(gap / 60)}h from the ${fmtMin(day.targetWakeMin)} wake target — mistimed light can shift the wrong way.`,
          });
        }
      }
      if (iv.kind === "caffeine_cutoff") {
        const before = (day.targetBedtimeMin - iv.startMin + 1440) % 1440;
        if (before < CAFFEINE_CUTOFF_BEFORE_BED_MIN) {
          violations.push({
            code: "CAFFEINE_TOO_LATE",
            dayIndex: day.dayIndex,
            message: `${day.label}: caffeine cutoff ${fmtMin(iv.startMin)} is only ${Math.round(before / 60)}h before the ${fmtMin(day.targetBedtimeMin)} bedtime.`,
          });
        }
      }
    }

    // --- Calendar conflicts -------------------------------------------------
    // Protected interventions need exclusive time. Point-in-time asks
    // (meal_timing, caffeine_cutoff, melatonin) may coincide with events.
    const PROTECTED = new Set(["light_exposure", "avoid_light", "sleep_window", "nap", "exercise"]);
    for (const ev of input.calendar) {
      if (ev.dayIndex !== day.dayIndex || ev.blocksInterventions === false) continue;
      for (const iv of day.interventions) {
        if (!PROTECTED.has(iv.kind)) continue;
        let ivEnd = iv.endMin ?? iv.startMin + 30;
        if (ivEnd <= iv.startMin) ivEnd += 1440; // overnight window
        if (!overlaps(iv.startMin, ivEnd, ev.startMin, ev.endMin)) continue;
        if (ev.movable) {
          adherencePenalty += 0.04;
          notes.push(
            `${day.label}: "${iv.kind.replace(/_/g, " ")}" overlaps movable "${ev.title}" — the negotiator can clear it.`,
          );
        } else {
          violations.push({
            code: "CALENDAR_CONFLICT",
            dayIndex: day.dayIndex,
            message: `${day.label}: "${iv.kind.replace(/_/g, " ")}" collides with fixed event "${ev.title}" (${fmtMin(ev.startMin)}–${fmtMin(ev.endMin)}).`,
          });
        }
      }
      // A fixed event that swallows the whole light window also breaks the plan.
      const lightIv = day.interventions.find((iv) => iv.kind === "light_exposure");
      if (
        lightIv &&
        day.shiftMin < 0 &&
        ev.startMin <= day.targetWakeMin &&
        ev.endMin >= day.targetWakeMin + LIGHT_ANCHOR_WINDOW_MIN
      ) {
        violations.push({
          code: "CALENDAR_CONFLICT",
          dayIndex: day.dayIndex,
          message: `${day.label}: "${ev.title}" blocks the entire morning light window.`,
        });
      }
    }

    // --- Adherence ----------------------------------------------------------
    // Only the candidate day's asks count against the gate — previously
    // locked days were already accepted, re-punishing them would make every
    // later day artificially harder to pass.
    if (i === input.days.length - 1) {
      for (const iv of day.interventions) {
        if (iv.startMin < input.adherence.ignoresInterventionsBeforeMin && iv.kind !== "sleep_window") {
          adherencePenalty += 0.06;
          notes.push(
            `${day.label}: ${iv.kind.replace(/_/g, " ")} at ${fmtMin(iv.startMin)} is before this person's compliance floor (${fmtMin(input.adherence.ignoresInterventionsBeforeMin)}) — history says they won't do it.`,
          );
        }
      }
    }
  });

  const feasible = violations.length === 0;
  const score = feasible ? Math.max(0, Math.round((0.95 - adherencePenalty) * 100) / 100) : 0;

  return {
    feasible,
    score,
    violations,
    notes,
  };
}

export function passes(result: EvalResult): boolean {
  return result.feasible && result.score >= PASS_SCORE;
}

export function fmtMin(min: number): string {
  const h = Math.floor(((min % 1440) + 1440) % 1440 / 60);
  const m = ((min % 1440) + 1440) % 1440 % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Fraction of the total required shift locked so far — drives the sun. */
export function sunProgress(trip: Trip, lockedDays: DayPlan[]): number {
  const done = lockedDays.reduce((acc, d) => acc + Math.abs(d.shiftMin), 0);
  return Math.min(1, done / Math.max(1, Math.abs(trip.requiredShiftMin)));
}
