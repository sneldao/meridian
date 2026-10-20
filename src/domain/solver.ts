import {
  CBT_BEFORE_WAKE_MIN,
  LIGHT_DELAY_HORIZON_MIN,
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

/** The sleep floor the plan must not go under — the same six hours the gate
 *  enforces. When a fixed commitment lands inside it, the day is not
 *  plannable around that commitment and the gate says so. */
const SLEEP_FLOOR_MIN = 360;

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
  const postFlight = spec.dayIndex > trip.departureDayIndex;

  // Post-flight: the body's phase — baseline + every locked shift, converted
  // to the destination frame once — decides where zeitgebers land, NOT the
  // sleep window. The schedule it shifts from is still the phase (that's
  // what the scorer now measures against), but the *targets* are local-night
  // times: after landing you sleep when the city sleeps, and zeitgebers do
  // the shifting.
  if (postFlight) {
    if (!baseline) return null;
    const off = trip.destination.utcOffsetMin - trip.origin.utcOffsetMin;
    let phaseBed = baseline.avgBedtimeMin + off;
    let phaseWake = baseline.avgWakeMin + off;
    for (const d of lockedDays) {
      phaseBed = wrap(phaseBed + d.shiftMin);
      phaseWake = wrap(phaseWake + d.shiftMin);
    }
    const east = trip.direction === "east";
    const bed = baseline.avgBedtimeMin;
    const wake = baseline.avgWakeMin;
    const cbt = wrap(phaseWake - CBT_BEFORE_WAKE_MIN);
    const interventions: Intervention[] = east
      ? [
          // A lagging body's CBT sits mid-morning local: keep it dark until
          // then (that light delays), light right after it advances.
          {
            kind: "avoid_light",
            startMin: wrap(cbt - LIGHT_DELAY_HORIZON_MIN / 2),
            endMin: cbt,
            note: `Shade and indoors until ${fmtMin(cbt)} — this light would push you back.`,
          },
          {
            kind: "light_exposure",
            startMin: wrap(cbt + 30),
            endMin: wrap(cbt + 90),
            note: `Bright light from ${fmtMin(wrap(cbt + 30))} — body's dawn zone, the advance lever.`,
          },
          {
            kind: "caffeine_cutoff",
            startMin: wrap(bed - CAFFEINE_CUTOFF_BEFORE_BED_MIN - 5),
            note: `Last caffeine 8h before the ${fmtMin(bed)} bedtime.`,
          },
          { kind: "sleep_window", startMin: bed, endMin: wake, note: `Bed ${fmtMin(bed)}, up ${fmtMin(wake)} — local night.` },
        ]
      : [
          // Ahead body (westward): CBT sits early-morning local — dark until
          // then, evening light delays.
          {
            kind: "avoid_light",
            startMin: wake,
            endMin: wrap(wake + 120),
            note: `Dark glasses until ${fmtMin(wrap(wake + 120))} — morning light undoes the delay.`,
          },
          {
            kind: "light_exposure",
            startMin: wrap(bed - 210),
            endMin: wrap(bed - 150),
            note: `Evening light ~2h before bed — the delay lever.`,
          },
          {
            kind: "caffeine_cutoff",
            startMin: wrap(bed - CAFFEINE_CUTOFF_BEFORE_BED_MIN - 5),
            note: `Last caffeine 8h before the ${fmtMin(bed)} bedtime.`,
          },
          { kind: "sleep_window", startMin: bed, endMin: wake, note: `Bed ${fmtMin(bed)}, up ${fmtMin(wake)} — local night.` },
        ];
    return {
      dayIndex: spec.dayIndex,
      label: spec.label,
      shiftMin,
      targetBedtimeMin: bed,
      targetWakeMin: wake,
      interventions,
    };
  }

  const ref = prev
    ? { bed: prev.targetBedtimeMin, wake: prev.targetWakeMin }
    : baseline
      ? { bed: baseline.avgBedtimeMin, wake: baseline.avgWakeMin }
      : null;
  if (!ref) return null;
  const bed = wrap(ref.bed + shiftMin);
  let wake = wrap(ref.wake + shiftMin);
  const east = trip.direction === "east";

  // The sleep window has to clear the day's fixed commitments. A plan whose
  // sleep runs into a 07:30 team breakfast is not a plan — the gate rejects
  // it, and before this the solver had no way to say so except to give up on
  // the day entirely, which lost a whole day of the shift over a conflict
  // the traveller could have slept around.
  const fixed = calendar.filter(
    (e) =>
      e.dayIndex === spec.dayIndex &&
      e.blocksInterventions !== false &&
      !e.movable,
  );
  for (const e of fixed) {
    const len = wrap(wake - bed) || 1440;
    const off = wrap(e.startMin - bed);
    if (off >= len) continue; // the commitment is outside the sleep window
    // Wake one minute before it, keeping as much sleep as that allows.
    const newLen = Math.max(0, off - 1);
    wake = newLen < SLEEP_FLOOR_MIN ? wrap(bed + SLEEP_FLOOR_MIN) : wrap(bed + newLen);
    break;
  }

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

  // The morning "dark glasses" block (a delay lever westward) is placed like
  // the light: a cue that lands on a fixed commitment is not a cue. It is a
  // small lever, so when the morning is too full to hold it, it is dropped
  // rather than smuggled in — the evening light is the delay's real work.
  const shadesStart = east
    ? null
    : placeBlock(
        spec.dayIndex,
        60,
        [
          wake,
          wrap(wake + 15),
          wrap(wake - 15),
          wrap(wake + 30),
          wrap(wake - 30),
          wrap(wake + 60),
          wrap(wake + 90),
          wrap(wake + 120),
          wrap(wake - 60),
          wrap(wake - 90),
        ],
        calendar,
      );

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
        // No melatonin window here on purpose. The phase-response model still
        // understands a melatonin timing cue, and the planner may propose one,
        // but the solver no longer inserts a supplement into a plan the
        // traveller did not ask for: the crew advises on timing, not on
        // medication, and a standing melatonin prompt reads as a standing
        // recommendation. Phase 1 of the dial work removed it here and in the
        // post-flight branch; docs/reference/scoring.md notes the model still
        // supports it when a plan carries it.
      ]
    : [
        ...(shadesStart === null
          ? []
          : [
              {
                kind: "avoid_light" as const,
                startMin: shadesStart,
                endMin: wrap(shadesStart + 60),
                note: `Dark glasses from ${fmtMin(shadesStart)} — morning light would undo the delay.`,
              },
            ]),
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

  // Five-minute steps, which is the domain's own granularity for a shift.
  // Coarser steps (15) could step *over* zero when the target was not a
  // multiple of them, so a day that could only be a hold was never drafted
  // and the solver gave up on it — losing a whole day of the trip to an
  // arithmetic accident.
  for (let s = target; s >= 0; s -= 5) {
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
