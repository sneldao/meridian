import {
  PASS_SCORE,
  type AdherenceProfile,
  type CalendarEvent,
  type Citation,
  type DayPlan,
  type EvalResult,
  type EvalViolation,
  type InterventionKind,
  type ShiftCoverage,
  type Trip,
} from "./types";
import { makesClinicalClaim, prescribesDose } from "./scope";

// Deterministic circadian model — the evaluator's ground truth.
// Agents propose; this code disposes. The constants encode well-supported
// physiology: ~90 min/day is a generous ceiling for endogenous phase shift,
// caffeine has a multi-hour half-life, and timed light is the dominant
// zeitgeber.

export const MAX_SHIFT_MIN_PER_DAY = 90;
export const CAFFEINE_CUTOFF_BEFORE_BED_MIN = 8 * 60;
export const MIN_SLEEP_MIN = 360;
export const LIGHT_ANCHOR_WINDOW_MIN = 120;

// --- Minimal phase-response model -------------------------------------------
// The day plans declare a shiftMin; the model below estimates how much shift
// the day's timing can physiologically deliver, so the gate judges the
// schedule rather than the planner's number. Timed light is the dominant
// zeitgeber: light after the core-body-temperature minimum (~2h before wake)
// advances the clock, light before it delays — the published PRC shape,
// flattened to step functions. Sleep-schedule moves, evening light avoidance,
// melatonin timing and morning exercise add smaller support in the same
// direction.
export const CBT_BEFORE_WAKE_MIN = 120;
export const LIGHT_ADVANCE_HORIZON_MIN = 300; // light ≤5h after CBTmin advances
export const LIGHT_DELAY_HORIZON_MIN = 480; // light ≤8h before CBTmin delays
export const LIGHT_BLOCK_SUPPORT_CAP_MIN = 60;
export const AVOID_LIGHT_SUPPORT_MIN = 15;
export const MELATONIN_SUPPORT_MIN = 15;
export const EXERCISE_SUPPORT_MIN = 10;
export const SLEEP_MOVE_SUPPORT_CAP_MIN = 45;
/** Declared shift may exceed modeled support by this much before the gate
 *  calls it wishful — the model is a floor on plausibility, not a simulator. */
export const SHIFT_OVER_TOLERANCE_MIN = 45;

/** Interventions that need exclusive time. Point-in-time asks (meal_timing,
 *  caffeine_cutoff, melatonin) may coincide with events. Shared with the
 *  orchestrator, which must not let the negotiator park an event on one. */
export const PROTECTED_KINDS = new Set<InterventionKind>([
  "light_exposure",
  "avoid_light",
  "sleep_window",
  "nap",
  "exercise",
]);

interface EvalInput {
  trip: Trip;
  days: DayPlan[];
  calendar: CalendarEvent[];
  adherence: AdherenceProfile;
  /** The research set the planner was given. When present, every citationId on
   *  a submitted plan must resolve against it. */
  citations?: Citation[];
  /** Habitual sleep reference for the first planned day — the model's
   *  sleep-schedule contribution needs something to measure the move from. */
  baseline?: { avgBedtimeMin: number; avgWakeMin: number };
}

const wrapMin = (m: number) => ((m % 1440) + 1440) % 1440;
/** Signed a−b on the clock, wrapped into (-720, 720]. */
const signedDiff = (a: number, b: number) => {
  const d = wrapMin(a - b);
  return d > 720 ? d - 1440 : d;
};

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

/** The calendar as it will actually be: moves folded in. Post-commit
 *  verification must judge the calendar the user ends up with, not the one the
 *  negotiator was handed. */
export function effectiveCalendar(events: CalendarEvent[]): CalendarEvent[] {
  return events.map((e) =>
    e.movedTo
      ? { ...e, dayIndex: e.movedTo.dayIndex, startMin: e.movedTo.startMin, endMin: e.movedTo.endMin }
      : { ...e },
  );
}

/** Minutes of phase shift the given days cover, and what is left owing. */
export function coverageOf(trip: Trip, days: DayPlan[]): ShiftCoverage {
  const requiredMin = Math.abs(trip.requiredShiftMin);
  const sign = trip.direction === "east" ? -1 : 1;
  // Signed, so a plan that flips direction nets out instead of inflating.
  const signed = days.reduce((acc, d) => acc + sign * d.shiftMin, 0);
  const achievedMin = Math.max(0, signed);
  const daysPlanned = days.length;
  const daysTotal = trip.days.length;
  return {
    requiredMin,
    achievedMin,
    residualMin: Math.max(0, requiredMin - achievedMin),
    ratio: requiredMin === 0 ? 1 : Math.min(1, achievedMin / requiredMin),
    daysTotal,
    daysPlanned,
    complete: achievedMin >= requiredMin,
  };
}

/** Minutes of phase shift this day's timing can plausibly deliver, signed the
 *  same way as DayPlan.shiftMin (negative = advance). `sleepRef` is the
 *  schedule the day is shifting *from* — the previous day's targets, or the
 *  wearer's baseline on day 0. Omit it when there is no honest reference (e.g.
 *  the day after in-flight sleep, which is transit, not an anchor). */
export function modelShiftMin(
  day: DayPlan,
  sleepRef?: { bedtimeMin: number; wakeMin: number },
): number {
  const cbt = wrapMin(day.targetWakeMin - CBT_BEFORE_WAKE_MIN);
  let advance = 0;
  let delay = 0;

  for (const iv of day.interventions) {
    let end = iv.endMin ?? iv.startMin + 30;
    if (end <= iv.startMin) end += 1440;
    const dur = end - iv.startMin;
    const rel = signedDiff(iv.startMin + dur / 2, cbt); // minutes after CBTmin
    const inAdvanceZone = rel > 0 && rel <= LIGHT_ADVANCE_HORIZON_MIN;
    const inDelayZone = rel >= -LIGHT_DELAY_HORIZON_MIN && rel <= 0;
    if (iv.kind === "light_exposure") {
      if (inAdvanceZone) advance += Math.min(LIGHT_BLOCK_SUPPORT_CAP_MIN, dur + 15);
      else if (inDelayZone) delay += Math.min(LIGHT_BLOCK_SUPPORT_CAP_MIN, dur + 15);
      // Midday light sits in the PRC dead zone — present but inert.
    } else if (iv.kind === "avoid_light") {
      // Removing the stimulus counts in the opposite direction: darkness in
      // the delay zone advances, darkness in the advance zone delays.
      if (inDelayZone) advance += AVOID_LIGHT_SUPPORT_MIN;
      else if (inAdvanceZone) delay += AVOID_LIGHT_SUPPORT_MIN;
    } else if (iv.kind === "melatonin") {
      // The melatonin PRC is ~12h out of phase with light: exogenous melatonin
      // in the hours before target bedtime advances; on waking it delays.
      const beforeBed = wrapMin(day.targetBedtimeMin - iv.startMin);
      const afterWake = wrapMin(iv.startMin - day.targetWakeMin);
      if (beforeBed >= 60 && beforeBed <= 420) advance += MELATONIN_SUPPORT_MIN;
      else if (afterWake <= 240) delay += MELATONIN_SUPPORT_MIN;
    } else if (iv.kind === "exercise") {
      const afterWake = wrapMin(iv.startMin + dur / 2 - day.targetWakeMin);
      if (afterWake <= 180) advance += EXERCISE_SUPPORT_MIN;
    }
  }

  // The sleep/dark schedule is itself a zeitgeber — moving it earns shift even
  // without light, up to the cap.
  if (sleepRef) {
    const midOf = (bed: number, wake: number) =>
      wrapMin(bed + wrapMin(wake - bed) / 2);
    const delta = signedDiff(
      midOf(day.targetBedtimeMin, day.targetWakeMin),
      midOf(sleepRef.bedtimeMin, sleepRef.wakeMin),
    );
    const move = Math.min(SLEEP_MOVE_SUPPORT_CAP_MIN, Math.abs(delta));
    if (delta < 0) advance += move;
    else if (delta > 0) delay += move;
  }

  return delay - advance;
}

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
    // A flip is a shift against the trip's direction — judged against the
    // trip, not the previous shifted day: a day returning to the right
    // direction after a flagged flip is the correction, not a second yo-yo.
    // Holds are pauses and don't change the reference.
    const referenceSign = input.trip.direction === "east" ? -1 : 1;
    if (day.shiftMin !== 0 && Math.sign(day.shiftMin) !== referenceSign) {
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

    // --- Declared vs. modeled shift ------------------------------------------
    // The planner writes shiftMin; the model derives what the day's zeitgeber
    // timing supports. The day after the flight has no schedule to shift from
    // (in-flight sleep is transit, not an anchor), so no sleep reference.
    if (day.shiftMin !== 0) {
      const prev = i > 0 ? input.days[i - 1] : undefined;
      const sleepRef =
        prev && prev.dayIndex !== input.trip.departureDayIndex
          ? { bedtimeMin: prev.targetBedtimeMin, wakeMin: prev.targetWakeMin }
          : i === 0 && input.baseline
            ? { bedtimeMin: input.baseline.avgBedtimeMin, wakeMin: input.baseline.avgWakeMin }
            : undefined;
      const support = Math.sign(day.shiftMin) * modelShiftMin(day, sleepRef);
      const gap = Math.abs(day.shiftMin) - support;
      if (gap > SHIFT_OVER_TOLERANCE_MIN) {
        violations.push({
          code: "SHIFT_OVERSTATED",
          dayIndex: day.dayIndex,
          message: `${day.label}: claims ${Math.abs(day.shiftMin)}min but the timing supports ~${Math.round(support)}min — move light into the right phase window, move the sleep schedule, or claim less.`,
        });
      } else if (gap > 0) {
        notes.push(
          `${day.label}: model supports ~${Math.round(support)}min of the claimed ${Math.abs(day.shiftMin)}min shift.`,
        );
      }
    }

    // --- Calendar conflicts -------------------------------------------------
    // Protected interventions need exclusive time. Point-in-time asks
    // (meal_timing, caffeine_cutoff, melatonin) may coincide with events.
    for (const ev of input.calendar) {
      if (ev.dayIndex !== day.dayIndex || ev.blocksInterventions === false) continue;
      for (const iv of day.interventions) {
        if (!PROTECTED_KINDS.has(iv.kind)) continue;
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

    // --- Scope gate ---------------------------------------------------------
    // The crew advises on timing and evidence, never on dosing or medicine.
    // Notes that prescribe a dose or make clinical claims fail hard — the same
    // boundary a production health product would enforce before anything
    // reaches a user. Rules live in domain/scope so the spoken narration is
    // judged by the identical gate.
    for (const iv of day.interventions) {
      if (prescribesDose(iv.note)) {
        violations.push({
          code: "DOSE_PRESCRIPTION",
          dayIndex: day.dayIndex,
          message: `${day.label}: "${iv.note.slice(0, 60)}" prescribes a dose — the crew advises on timing, not medication.`,
        });
      }
      if (makesClinicalClaim(iv.note)) {
        violations.push({
          code: "UNSAFE_CLAIM",
          dayIndex: day.dayIndex,
          message: `${day.label}: "${iv.note.slice(0, 60)}" makes a clinical claim — cite evidence, never diagnose or prescribe.`,
        });
      }
    }

    // --- Evidence integrity --------------------------------------------------
    // "Grounded in real literature" is the product's claim, so it is checked
    // rather than asserted: a citationId that is not in the research set Jun
    // actually returned is a hallucinated reference wearing a DOI's shape.
    // The valid ids go in the message so the retry has what it needs to fix it.
    if (input.citations) {
      const valid = new Set(input.citations.map((c) => c.id));
      for (const iv of day.interventions) {
        if (iv.citationId && !valid.has(iv.citationId)) {
          violations.push({
            code: "UNKNOWN_CITATION",
            dayIndex: day.dayIndex,
            message: `${day.label}: citation "${iv.citationId}" is not in the research set. Use one of: ${[...valid].join(", ") || "(none retrieved)"}.`,
          });
        }
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
  const coverage = coverageOf(input.trip, input.days);

  // Adequacy, not feasibility: every day gate can pass on a plan that still
  // lands the wearer hours out of sync. Surfaced as a note, never as a failure
  // — partial adaptation before touchdown is the expected outcome of a
  // physiological ceiling meeting a fixed day budget, not a planner error.
  if (!coverage.complete && coverage.daysPlanned > 0) {
    notes.push(
      `${Math.round(coverage.ratio * 100)}% of the ${Math.round(coverage.requiredMin / 60)}h shift covered after ${coverage.daysPlanned}/${coverage.daysTotal} days — ${Math.round(coverage.residualMin / 6) / 10}h still owed at landing.`,
    );
  }

  return {
    feasible,
    score,
    violations,
    notes,
    coverage,
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
