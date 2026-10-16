import {
  CAFFEINE_CUTOFF_BEFORE_BED_MIN,
  MAX_SHIFT_MIN_PER_DAY,
  coverageOf,
  evaluatePlan,
  fmtMin,
  passes,
} from "./circadian";
import type {
  AdherenceProfile,
  CalendarEvent,
  DayPlan,
  DaySpec,
  EvalResult,
  Intervention,
  Trip,
} from "./types";

// The placement solver — the non-LLM half of planning. The planner (Otto)
// decides intent: how aggressive the day should be, what the wearer is told.
// The solver owns feasibility: it searches shift magnitude and intervention
// placement against the same gate the evaluator uses, so the draft it hands
// the planner is one the scorer has already accepted — or it reports that no
// template placement exists and the day needs a human look.
//
// This is deliberately a small constraint search, not a general optimizer:
// the day's degrees of freedom are a handful of timed blocks, so a bounded
// sweep (shift ↓ in 15min steps, light start slid across its legal window)
// exhausts the space in microseconds and stays honest — the scorer inside the
// loop is the same code that gates every candidate.

export interface SolveDayInput {
  trip: Trip;
  spec: DaySpec;
  /** Days already locked, in order — the schedule this day shifts from. */
  lockedDays: DayPlan[];
  calendar: CalendarEvent[];
  adherence: AdherenceProfile;
  /** Habitual sleep times for the first day's reference. */
  baseline?: { avgBedtimeMin: number; avgWakeMin: number };
}

export interface SolvedDay {
  plan: DayPlan;
  result: EvalResult;
}

const wrap = (m: number) => ((m % 1440) + 1440) % 1440;
const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

/** Furthest the light block may start after the wake target — also the
 *  eastbound wake margin below the compliance floor (floor − this is the
 *  earliest wake a shift may produce, so the anchor can still open at the
 *  floor). */
const LIGHT_START_MAX_OFFSET_MIN = 105;

/** First duration-min slot from `starts` that no blocking event on that day
 *  overlaps, or null. */
function placeBlock(
  dayIndex: number,
  duration: number,
  starts: number[],
  calendar: CalendarEvent[],
): number | null {
  for (const s of starts.map(wrap)) {
    const clash = calendar.some(
      (e) =>
        e.dayIndex === dayIndex &&
        e.blocksInterventions !== false &&
        overlaps(s, s + duration, e.startMin, e.endMin),
    );
    if (!clash) return s;
  }
  return null;
}

/** Candidate starts for the day's light block, best first. Advance days want
 *  light starting at the new wake target (the anchor window is ±120min of it);
 *  delay days want a solid evening block ending well before bedtime. */
function lightStarts(
  trip: Trip,
  day: { targetWakeMin: number; targetBedtimeMin: number },
  floorMin: number,
): { starts: number[]; duration: number } {
  if (trip.direction === "east") {
    // Prefer the first light the wearer will actually get up for: the
    // compliance floor, when it lands inside the anchor window.
    const preferred = Math.max(
      day.targetWakeMin,
      Math.min(floorMin, day.targetWakeMin + LIGHT_START_MAX_OFFSET_MIN),
    );
    const starts = [preferred];
    // Floor band next, then the anchor window: a legal slot at/after the floor
    // always beats an earlier one — "no ask before the floor when a legal one
    // exists". Below-floor anchor candidates stay last for days where every
    // ≥floor slot is genuinely blocked.
    for (let off = 0; off <= LIGHT_START_MAX_OFFSET_MIN; off += 15) starts.push(floorMin + off);
    for (let off = 0; off <= LIGHT_START_MAX_OFFSET_MIN; off += 15) starts.push(day.targetWakeMin + off);
    for (const off of [-15, -30, -45, -60]) starts.push(day.targetWakeMin + off);
    return { starts: [...new Set(starts.map(wrap))], duration: 60 };
  }
  const bed = day.targetBedtimeMin;
  return {
    starts: [bed - 180, bed - 150, bed - 210, bed - 120, bed - 240, bed - 90].map(wrap),
    duration: 60,
  };
}

function draftDay(
  input: SolveDayInput,
  shiftMin: number,
): DayPlan | null {
  const { trip, spec, calendar, adherence, lockedDays, baseline } = input;
  const prev = lockedDays[lockedDays.length - 1];
  let ref = prev
    ? { bed: prev.targetBedtimeMin, wake: prev.targetWakeMin }
    : baseline
      ? { bed: baseline.avgBedtimeMin, wake: baseline.avgWakeMin }
      : null;
  if (!ref) return null;
  // Clock frame: the first day after the flight is destination-local, so the
  // schedule it shifts from is the locked (origin-frame) day converted into
  // destination time. The scorer drops the sleep reference across the same
  // boundary, so only the placement math needs it.
  if (prev && spec.dayIndex > trip.departureDayIndex && prev.dayIndex <= trip.departureDayIndex) {
    const off = trip.destination.utcOffsetMin - trip.origin.utcOffsetMin;
    ref = { bed: wrap(ref.bed + off), wake: wrap(ref.wake + off) };
  }
  const bed = wrap(ref.bed + shiftMin);
  const wake = wrap(ref.wake + shiftMin);
  const east = trip.direction === "east";

  const { starts, duration } = lightStarts(
    trip,
    { targetWakeMin: wake, targetBedtimeMin: bed },
    adherence.ignoresInterventionsBeforeMin,
  );
  let lightStart = placeBlock(spec.dayIndex, duration, starts, calendar);
  let lightDur = duration;
  if (lightStart === null) {
    // Shorten the block before giving up on light entirely.
    lightDur = 30;
    lightStart = placeBlock(spec.dayIndex, lightDur, starts, calendar);
    if (lightStart === null) return null;
  }

  // The wind-down block wants the last hour before bed; when a fixed event
  // eats into it (a late dinner), take the latest start that still clears it.
  const avoidStart = east
    ? [60, 45, 30, 15]
      .map((b) => wrap(bed - b))
      .find(
        (s) =>
          !calendar.some(
            (e) =>
              e.dayIndex === spec.dayIndex &&
              e.blocksInterventions !== false &&
              overlaps(s, bed, e.startMin, e.endMin),
          ),
      )
    : undefined;

  const interventions: Intervention[] = east
    ? [
        {
          kind: "light_exposure",
          startMin: lightStart,
          endMin: wrap(lightStart + lightDur),
          note: `Bright light at ${fmtMin(lightStart)} — post-wake anchor for the advance.`,
        },
        {
          kind: "caffeine_cutoff",
          startMin: wrap(bed - CAFFEINE_CUTOFF_BEFORE_BED_MIN - 5),
          note: `Last caffeine 8h before the ${fmtMin(bed)} bedtime.`,
        },
        {
          kind: "avoid_light",
          startMin: avoidStart ?? wrap(bed - 60),
          endMin: bed,
          note: "Lights low for the last hour — evening light works against the advance.",
        },
        {
          kind: "melatonin",
          startMin: wrap(bed - 270),
          note: `Melatonin timing window ~4–5h before bed (timing only, no dose).`,
        },
      ]
    : [
        {
          kind: "avoid_light",
          startMin: wake,
          endMin: wrap(wake + 60),
          note: "Dark glasses for the first hour — morning light would undo the delay.",
        },
        {
          kind: "caffeine_cutoff",
          startMin: wrap(bed - CAFFEINE_CUTOFF_BEFORE_BED_MIN - 5),
          note: `Last caffeine 8h before the ${fmtMin(bed)} bedtime.`,
        },
        {
          kind: "light_exposure",
          startMin: lightStart,
          endMin: wrap(lightStart + lightDur),
          note: `Evening light at ${fmtMin(lightStart)} — the delay lever.`,
        },
      ];

  interventions.push({
    kind: "sleep_window",
    startMin: bed,
    endMin: wake,
    note: `Bed ${fmtMin(bed)}, up ${fmtMin(wake)}.`,
  });

  return {
    dayIndex: spec.dayIndex,
    label: spec.label,
    shiftMin,
    targetBedtimeMin: bed,
    targetWakeMin: wake,
    interventions,
  };
}

/** Solve one day: the largest feasible shift (≤ the physiological ceiling, ≤
 *  what the trip still owes) whose placement the scorer accepts. Returns null
 *  when no template placement passes — the honest "this day needs a human"
 *  signal, since solver-infeasible is not proof of infeasible. A hold day
 *  (shift 0) is always in the search space. */
export function solveDay(input: SolveDayInput): SolvedDay | null {
  const { trip, spec, lockedDays, calendar, adherence, baseline } = input;
  const sign = trip.direction === "east" ? -1 : 1;
  const remaining = coverageOf(trip, lockedDays).residualMin;
  const daysLeft = trip.days.length - spec.dayIndex;
  const spread = Math.ceil(remaining / Math.max(1, daysLeft) / 5) * 5;
  const target = Math.min(MAX_SHIFT_MIN_PER_DAY, remaining, Math.max(spread, 15));

  // East, the compliance floor caps the shift: never pick a wake earlier
  // than floor − LIGHT_START_MAX_OFFSET_MIN, so the light anchor can still
  // open at the floor. Unwrapped arithmetic on purpose — wrapped wakes in
  // the early-morning range must compare as small numbers, not ~23:xx. A
  // hold (s = 0) is always allowed.
  const prev = lockedDays[lockedDays.length - 1];
  const frameOffMin =
    prev && spec.dayIndex > trip.departureDayIndex && prev.dayIndex <= trip.departureDayIndex
      ? trip.destination.utcOffsetMin - trip.origin.utcOffsetMin
      : 0;
  const refWake = prev ? prev.targetWakeMin + frameOffMin : baseline?.avgWakeMin;

  for (let s = target; s >= 0; s -= 15) {
    if (
      trip.direction === "east" &&
      s > 0 &&
      refWake !== undefined &&
      refWake - s < adherence.ignoresInterventionsBeforeMin - LIGHT_START_MAX_OFFSET_MIN
    )
      continue;
    const plan = draftDay(input, sign * s);
    if (!plan) continue;
    const result = evaluatePlan({
      trip,
      days: [...lockedDays, plan],
      calendar,
      adherence,
      baseline,
    });
    if (passes(result)) return { plan, result };
  }
  return null;
}

/** Solves every day of the trip in order — the pre-run preview runs the same
 *  chain the crew would lock, so what the preview shows is what the scorer
 *  accepts. Days the solver can't place stay null (the honest "not placed"
 *  signal) and don't advance the chain; later days solve from the last
 *  locked plan. Keyed by DaySpec.label, like run.locked / run.drafts. */
export function previewPlan(input: {
  trip: Trip;
  calendar: CalendarEvent[];
  adherence: AdherenceProfile;
  baseline?: { avgBedtimeMin: number; avgWakeMin: number };
}): Map<string, SolvedDay | null> {
  const { trip, calendar, adherence, baseline } = input;
  const lockedDays: DayPlan[] = [];
  const out = new Map<string, SolvedDay | null>();
  for (const spec of trip.days) {
    const solved = solveDay({ trip, spec, lockedDays, calendar, adherence, baseline });
    out.set(spec.label, solved);
    if (solved) lockedDays.push(solved.plan);
  }
  return out;
}
