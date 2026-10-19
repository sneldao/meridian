// How far off the body clock actually is — and how honest that number is.
//
// The rule this module exists to enforce: the gap on screen is never the
// plan's own claim. A plan says "shift 90 minutes today"; the scorer checks
// whether the day's zeitgeber timing can deliver 90 minutes; this module asks
// the *same* question and reports what the body is projected to do. The number
// that reaches the traveller is the residual after the physiology has had its
// say, not the arithmetic on the planner's optimism.
//
// So the body clock here is a phase chain, stepped by `modelShiftMin` — the
// phase-response model the scorer gates with — capped at the physiological
// ceiling and never at the declared shift. The do-nothing baseline is the
// same chain with no plan: the traveller keeps their habitual schedule until
// the flight, then lives in the destination under whatever daylight it has.
// Both numbers come out of one model, so "your plan is 1.4h better than doing
// nothing" is a comparison between two runs of the same machinery.

import { MAX_SHIFT_MIN_PER_DAY, modelShiftMin } from "./circadian";
import { isDaylight } from "./sun";
import { utcOffsetMinOn, wrapShiftMin } from "./timezones";
import type {
  CalendarEvent,
  City,
  DayPlan,
  DaySpec,
  Trip,
  WearableBaseline,
} from "./types";

const DAY_MIN = 1440;

/** Wrap any minute value onto [0, 1440). */
export function wrapClockMin(m: number): number {
  return ((m % DAY_MIN) + DAY_MIN) % DAY_MIN;
}

/**
 * Signed circular difference (a - b) on a 24-hour clock in minutes,
 * wrapped into (-720, +720]. Handles midnight wraparound: 00:30 vs 23:30
 * is +60 minutes, not -1350.
 */
export function circularSignedDiffMin(aMin: number, bMin: number): number {
  const d = wrapClockMin(aMin - bMin);
  return d > 720 ? d - 1440 : d;
}

/**
 * Absolute circular distance on a 24-hour clock in minutes, in [0, 720].
 * The distance between 23:15 and 00:45 is 90 minutes (1.5h).
 */
export function circularDistanceMin(aMin: number, bMin: number): number {
  return Math.abs(circularSignedDiffMin(aMin, bMin));
}

/** Sleep midpoint on the 24-hour clock, handling overnight intervals. */
export function sleepMidpointMin(bedtimeMin: number, wakeMin: number): number {
  const bed = wrapClockMin(bedtimeMin);
  const wake = wrapClockMin(wakeMin);
  const duration = wrapClockMin(wake - bed);
  return wrapClockMin(bed + duration / 2);
}

/**
 * Timezone shift between two IANA zones on specific ISO dates, so a trip
 * that crosses a DST boundary is planned against the offsets that actually
 * apply on the day (London is UTC+1 until 25 Oct 2026, UTC+0 after).
 */
export function shiftBetweenTimezonesOnDates(
  originTz: string,
  originDateIso: string,
  destTz: string,
  destDateIso: string,
): {
  originOffsetMin: number;
  destOffsetMin: number;
  requiredShiftMin: number;
  hoursAbs: number;
  direction: "east" | "west";
} {
  const originOffsetMin = utcOffsetMinOn(originTz, originDateIso);
  const destOffsetMin = utcOffsetMinOn(destTz, destDateIso);
  const requiredShiftMin = wrapShiftMin(originOffsetMin - destOffsetMin);
  return {
    originOffsetMin,
    destOffsetMin,
    requiredShiftMin,
    hoursAbs: Math.round((Math.abs(requiredShiftMin) / 60) * 10) / 10,
    direction: requiredShiftMin <= 0 ? "east" : "west",
  };
}

// --- Uncertainty ------------------------------------------------------------
//
// The band is not decoration: it says how much of the number is model. Three
// contributions, each stated so it can be argued with:
//
//   · the baseline phase is only known to about half an hour from a wearable
//     (or worse from self-report) — the starting point of the whole chain;
//   · each day's modelled support carries its own error, and independent days
//     accumulate as a random walk, not a sum;
//   · a day the traveller skipped, or a night of drinking, widens the band
//     because the day's real behaviour is no longer what the plan assumed.

/** How well the wearer's baseline phase is known. */
export const PHASE_UNCERTAINTY_MIN = 30;
/** …and how well it is known when a wearable supplied it. */
export const WEARABLE_PHASE_UNCERTAINTY_MIN = 20;
/** Per-day error in the modelled support. */
export const PER_DAY_SUPPORT_UNCERTAINTY_MIN = 15;
/** A skipped clock-moving action: the day did not happen as modelled. */
export const SKIP_UNCERTAINTY_MIN = 15;
/** Alcohol: sleep quality and phase are both less predictable. */
export const ALCOHOL_UNCERTAINTY_MIN = 20;
/** The band never claims more than this. */
export const MAX_UNCERTAINTY_HALF_WIDTH_MIN = 90;

/**
 * Uncontrolled daylight is dimmer than the bright-light doses the
 * phase-response model was calibrated on, so the baseline credits ambient
 * light at half the modelled rate. Without this the do-nothing case drifts
 * faster than the literature's ~1h/day, which would flatter the plan.
 */
export const AMBIENT_LIGHT_DISCOUNT = 0.5;

/** Round to the nearest 5 minutes — a clock reading, not a computation. */
const round5 = (m: number) => Math.round(m / 5) * 5;

// --- Direction: the advance-vs-delay selector ------------------------------

export type DirectionId = "advance" | "delay";

export interface DirectionOption {
  id: DirectionId;
  /** Hours the clock has to move under this option. */
  hours: number;
  /**
   * Whether the plan machinery can execute this direction. The scorer
   * rejects a day whose shift points against the trip (`SHIFT_DIRECTION_FLIP`)
   * and the solver only ever shifts one way, so the long way round is not a
   * choice the product can honour — it is stated, not offered.
   */
  executable: boolean;
  /** Why this option is (or is not) executable, in one sentence. */
  note: string;
}

/**
 * The advance-vs-delay options for a trip.
 *
 * For a big eastward jump the literature discusses advancing the clock
 * *against* the direction of travel (an antidromic, "delay by 24 − h" strategy)
 * for travellers with a late chronotype. It is a real technique. It is also
 * not expressible in this product: the solver places zeitgebers for one
 * direction and the scorer refuses a flip. So it is returned with
 * `executable: false` and the reason attached, rather than offered as a
 * toggle that would produce a plan the gate throws away.
 */
export function directionOptions(
  trip: Trip,
  chronotype: WearableBaseline["chronotype"] = "neutral",
): DirectionOption[] {
  const hours = Math.round((Math.abs(trip.requiredShiftMin) / 60) * 10) / 10;
  const east = trip.direction === "east";

  const executable: DirectionOption = east
    ? {
        id: "advance",
        hours,
        executable: true,
        note: `Advance ${hours}h with timed morning light — the direction the trip's shift is measured in.`,
      }
    : {
        id: "delay",
        hours,
        executable: true,
        note: `Delay ${hours}h with timed evening light — the direction the trip's shift is measured in.`,
      };

  const longWayHours = Math.round((24 - hours) * 10) / 10;
  const alternative: DirectionOption = {
    id: east ? "delay" : "advance",
    hours: longWayHours,
    executable: false,
    note:
      east && hours >= 8 && chronotype === "late"
        ? `Delay ${longWayHours}h instead of advancing ${hours}h. Discussed in the literature for late chronotypes, but Meridian's solver places one direction of zeitgeber and the scorer rejects the other — so this is context, not a setting.`
        : `Advance ${longWayHours}h instead of delaying ${hours}h — the long way round. Meridian's solver places one direction of zeitgeber and the scorer rejects the other, so this is context, not a setting.`,
  };

  return [executable, alternative];
}

// --- The trajectory ---------------------------------------------------------

export interface CommitmentConflict {
  event: CalendarEvent;
  conflictWith: "sleep" | "light";
  tradeOffNote: string;
}

export interface DayMisalignmentPoint {
  dayIndex: number;
  label: string;
  date: string;
  /** Modelled body-clock sleep window, in this day's clock frame. */
  bodyBedMin: number;
  bodyWakeMin: number;
  /** The day's plan targets — what the traveller is being asked to hit. */
  planBedMin: number;
  planWakeMin: number;
  /** Where the body should be to be fully adapted to the destination. */
  targetBedMin: number;
  targetWakeMin: number;
  /** Circular gap between the modelled body clock and that target, in hours. */
  misalignmentHours: number;
  misalignmentLowHours: number;
  misalignmentHighHours: number;
  /** The same gap if the traveller did nothing at all. */
  baselineMisalignmentHours: number;
  baselineLowHours: number;
  baselineHighHours: number;
  /** Minutes of phase shift still owed, signed by the direction of travel. */
  residualMin: number;
  /** Minutes the day's timing actually supports. */
  modelledShiftMin: number;
  /** Minutes the plan claims. */
  declaredShiftMin: number;
  /** Half-width of the uncertainty band, in minutes. */
  uncertaintyHalfWidthMin: number;
  /** Whether the traveller skipped this day's clock-moving action. */
  skipped: boolean;
  /** Whether the traveller flagged drinking on this day. */
  alcohol: boolean;
  /** Commitments that clash with the plan's windows. */
  commitmentConflicts: CommitmentConflict[];
}

export interface TrajectoryInput {
  trip: Trip;
  /** The scored day plans. Empty is fine — that is the do-nothing case. */
  days: DayPlan[];
  baseline: WearableBaseline;
  calendar?: CalendarEvent[];
  /** Day indices where the traveller skipped the clock-moving action. */
  skippedDayIndices?: Set<number>;
  /** Day indices where the traveller flagged drinking. */
  alcoholDayIndices?: Set<number>;
  /** Whether a wearable supplied the baseline (tighter band). */
  wearableOptedIn?: boolean;
}

interface Phase {
  bedtimeMin: number;
  wakeMin: number;
}

/** The clock-moving interventions — the ones a skip actually costs. */
const CLOCK_MOVERS = new Set(["light_exposure", "avoid_light"]);

/**
 * The daylight window in a city's local clock on a given date, in local
 * minutes. Used to model the baseline: in the destination, the traveller
 * cannot schedule the sun.
 */
export function daylightWindowMin(
  city: City,
  dateIso: string,
): { startMin: number; endMin: number } | null {
  const offsetMin = city.tz ? utcOffsetMinOn(city.tz, dateIso) : city.utcOffsetMin;
  const localMidnightUtc = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(localMidnightUtc)) return null;
  const STEP = 10;
  let first: number | null = null;
  let last: number | null = null;
  for (let m = 0; m < DAY_MIN; m += STEP) {
    const at = new Date(localMidnightUtc + (m - offsetMin) * 60_000);
    if (isDaylight(city.lat, city.lon, at)) {
      if (first === null) first = m;
      last = m + STEP;
    }
  }
  if (first === null || last === null) return null;
  return { startMin: first, endMin: wrapClockMin(last) };
}

/**
 * The phase shift a day of ambient daylight delivers, as the phase-response
 * model sees it. The daylight is split at the body's own trough so each half
 * is judged in the zone it actually falls in — light before the trough delays
 * (which is exactly why eastward travel is hard), light after it advances.
 */
function ambientSupportMin(
  day: DayPlan,
  phase: Phase,
  window: { startMin: number; endMin: number } | null,
): number {
  if (!window) return 0;
  const cbt = wrapClockMin(phase.wakeMin - 120);
  const blocks: DayPlan["interventions"] = [];
  const push = (s: number, e: number) => {
    if (e - s <= 0) return;
    blocks.push({ kind: "light_exposure", startMin: s, endMin: e, note: "ambient daylight" });
  };
  // Daylight in the frame the day's targets use, split at the trough.
  const start = window.startMin;
  const end = window.endMin;
  if (end > start) {
    const mid = wrapClockMin(start + (end - start) / 2);
    if (mid < cbt) {
      push(start, cbt);
      push(cbt, end);
    } else {
      push(start, end);
    }
  } else {
    // Wrapped window (daylight across midnight at high latitudes).
    push(start, DAY_MIN);
    push(0, end);
  }
  const synthetic: DayPlan = {
    ...day,
    shiftMin: 0,
    targetBedtimeMin: phase.bedtimeMin,
    targetWakeMin: phase.wakeMin,
    interventions: blocks,
  };
  const raw = modelShiftMin(synthetic, phase, phase);
  return round5(raw * AMBIENT_LIGHT_DISCOUNT);
}

/**
 * The deterministic day-by-day circadian trajectory: where the body clock is
 * projected to be, how far that is from the destination, and how far it would
 * have been with no plan at all.
 */
export function computeTripTrajectory(input: TrajectoryInput): DayMisalignmentPoint[] {
  const {
    trip,
    days,
    baseline,
    calendar = [],
    skippedDayIndices = new Set(),
    alcoholDayIndices = new Set(),
    wearableOptedIn = false,
  } = input;

  const requiredMin = Math.abs(trip.requiredShiftMin);
  // Sign convention, shared with the rest of the domain: negative shiftMin
  // means the clock moves earlier (an advance, eastward travel).
  const sign = trip.direction === "east" ? -1 : 1;

  // Where the body wants to end up: its habitual night, moved by the trip's
  // shift. Pre-flight that reads in the origin's clock frame; after the
  // flight it reads in the destination's.
  const habitualBed = wrapClockMin(baseline.avgBedtimeMin);
  const habitualWake = wrapClockMin(baseline.avgWakeMin);
  const endStateHomeFrame = {
    bedtimeMin: wrapClockMin(habitualBed + trip.requiredShiftMin),
    wakeMin: wrapClockMin(habitualWake + trip.requiredShiftMin),
  };
  const endStateDestFrame = {
    bedtimeMin: habitualBed,
    wakeMin: habitualWake,
  };

  // Two chains over the same days: the plan, and doing nothing.
  let body: Phase = { bedtimeMin: habitualBed, wakeMin: habitualWake };
  let base: Phase = { bedtimeMin: habitualBed, wakeMin: habitualWake };
  // The flight converts the frame once. Everything after it is in local time.
  const flightOffsetMin = trip.destination.utcOffsetMin - trip.origin.utcOffsetMin;
  let frameConverted = false;

  // The previous day's targets — the schedule the current day shifts *from*.
  let prevTargets: Phase | null = null;
  // Accumulated error in the chain, as a random walk over independent days.
  let variance = 0;

  const planFor = (spec: DaySpec): DayPlan | undefined =>
    days.find((d) => d.dayIndex === spec.dayIndex) ??
    days.find((d) => d.label === spec.label);

  return trip.days.map((spec, idx) => {
    const plan = planFor(spec);
    const postFlight = spec.dayIndex > trip.departureDayIndex;
    const isSkipped = skippedDayIndices.has(spec.dayIndex);
    const hasAlcohol = alcoholDayIndices.has(spec.dayIndex);

    if (postFlight && !frameConverted) {
      // The body does not change at the flight; the clock it is read on does.
      body = {
        bedtimeMin: wrapClockMin(body.bedtimeMin + flightOffsetMin),
        wakeMin: wrapClockMin(body.wakeMin + flightOffsetMin),
      };
      base = {
        bedtimeMin: wrapClockMin(base.bedtimeMin + flightOffsetMin),
        wakeMin: wrapClockMin(base.wakeMin + flightOffsetMin),
      };
      frameConverted = true;
    }

    // --- the plan's chain --------------------------------------------------
    let modelledShiftMin = 0;
    if (plan) {
      // A skipped clock-moving action contributes nothing: the day's light
      // never happened, so the body moved no further for it.
      const effective: DayPlan = isSkipped
        ? {
            ...plan,
            interventions: plan.interventions.filter(
              (iv) => !CLOCK_MOVERS.has(iv.kind),
            ),
          }
        : plan;
      // The schedule the day shifts from: yesterday's targets, the baseline
      // on day 0, and nothing at all after the in-flight night (transit is
      // not an anchor).
      const sleepRef = postFlight
        ? undefined
        : (prevTargets ?? { bedtimeMin: habitualBed, wakeMin: habitualWake });
      const support = modelShiftMin(effective, sleepRef, body);
      modelledShiftMin = Math.max(
        -MAX_SHIFT_MIN_PER_DAY,
        Math.min(MAX_SHIFT_MIN_PER_DAY, support),
      );
      body = {
        bedtimeMin: wrapClockMin(body.bedtimeMin + modelledShiftMin),
        wakeMin: wrapClockMin(body.wakeMin + modelledShiftMin),
      };
    }

    // --- the do-nothing chain ---------------------------------------------
    const ambientWindow = postFlight
      ? daylightWindowMin(trip.destination, spec.date)
      : null;
    const baseSupport = ambientSupportMin(
      {
        dayIndex: spec.dayIndex,
        label: spec.label,
        shiftMin: 0,
        targetBedtimeMin: base.bedtimeMin,
        targetWakeMin: base.wakeMin,
        interventions: [],
      },
      base,
      ambientWindow,
    );
    const baseShift = Math.max(
      -MAX_SHIFT_MIN_PER_DAY,
      Math.min(MAX_SHIFT_MIN_PER_DAY, baseSupport),
    );
    base = {
      bedtimeMin: wrapClockMin(base.bedtimeMin + baseShift),
      wakeMin: wrapClockMin(base.wakeMin + baseShift),
    };

    // --- the numbers --------------------------------------------------------
    const endState = postFlight ? endStateDestFrame : endStateHomeFrame;
    const bodyMid = sleepMidpointMin(body.bedtimeMin, body.wakeMin);
    const baseMid = sleepMidpointMin(base.bedtimeMin, base.wakeMin);
    const targetMid = sleepMidpointMin(endState.bedtimeMin, endState.wakeMin);
    const planBedMin = plan ? wrapClockMin(plan.targetBedtimeMin) : endState.bedtimeMin;
    const planWakeMin = plan ? wrapClockMin(plan.targetWakeMin) : endState.wakeMin;

    const gapMin = circularDistanceMin(bodyMid, targetMid);
    const baseGapMin = circularDistanceMin(baseMid, targetMid);
    const misalignmentHours = round1(gapMin / 60);
    const baselineMisalignmentHours = round1(baseGapMin / 60);

    // How much is still owed, signed by the direction of travel: positive
    // means the clock still has to move this way.
    const residualMin = Math.round(
      sign < 0
        ? wrapClockMin(bodyMid - targetMid)
        : wrapClockMin(targetMid - bodyMid),
    );

    // --- the band -----------------------------------------------------------
    variance += PER_DAY_SUPPORT_UNCERTAINTY_MIN ** 2;
    const base_ = wearableOptedIn ? WEARABLE_PHASE_UNCERTAINTY_MIN : PHASE_UNCERTAINTY_MIN;
    const uncertaintyHalfWidthMin = Math.min(
      MAX_UNCERTAINTY_HALF_WIDTH_MIN,
      Math.round(
        base_ +
          Math.sqrt(variance) +
          (isSkipped ? SKIP_UNCERTAINTY_MIN : 0) +
          (hasAlcohol ? ALCOHOL_UNCERTAINTY_MIN : 0),
      ),
    );
    const halfBandHours = uncertaintyHalfWidthMin / 60;

    const point: DayMisalignmentPoint = {
      dayIndex: spec.dayIndex,
      label: spec.label,
      date: spec.date,
      bodyBedMin: body.bedtimeMin,
      bodyWakeMin: body.wakeMin,
      planBedMin,
      planWakeMin,
      targetBedMin: endState.bedtimeMin,
      targetWakeMin: endState.wakeMin,
      misalignmentHours,
      misalignmentLowHours: round1(Math.max(0, misalignmentHours - halfBandHours)),
      misalignmentHighHours: round1(misalignmentHours + halfBandHours),
      baselineMisalignmentHours,
      baselineLowHours: round1(Math.max(0, baselineMisalignmentHours - halfBandHours)),
      baselineHighHours: round1(baselineMisalignmentHours + halfBandHours),
      residualMin,
      modelledShiftMin,
      declaredShiftMin: plan?.shiftMin ?? 0,
      uncertaintyHalfWidthMin,
      skipped: isSkipped,
      alcohol: hasAlcohol,
      commitmentConflicts: findConflicts(spec, plan, calendar),
    };

    if (plan) {
      prevTargets = {
        bedtimeMin: plan.targetBedtimeMin,
        wakeMin: plan.targetWakeMin,
      };
    }
    void idx;
    void requiredMin;
    return point;
  });
}

/** Commitments that clash with the plan's light or sleep windows. */
function findConflicts(
  spec: DaySpec,
  plan: DayPlan | undefined,
  calendar: CalendarEvent[],
): CommitmentConflict[] {
  if (!plan) return [];
  const out: CommitmentConflict[] = [];
  const lightIv = plan.interventions.find((iv) => iv.kind === "light_exposure");
  const targetBed = plan.targetBedtimeMin;

  for (const ev of calendar) {
    if ((ev.movedTo?.dayIndex ?? ev.dayIndex) !== spec.dayIndex) continue;
    if (ev.blocksInterventions === false) continue;
    const evStart = ev.movedTo?.startMin ?? ev.startMin;
    const evEnd = ev.movedTo?.endMin ?? ev.endMin;

    if (lightIv) {
      const lStart = lightIv.startMin;
      const lEnd = lightIv.endMin ?? lStart + 60;
      if (evStart < lEnd && lStart < evEnd) {
        out.push({
          event: ev,
          conflictWith: "light",
          tradeOffNote: ev.movable
            ? `"${ev.title}" overlaps your ${fmtClock(lStart)} light window — it can be moved.`
            : `"${ev.title}" (${fmtClock(evStart)}–${fmtClock(evEnd)}) clips the light window; the plan works around it.`,
        });
      }
    }

    if (targetBed > 18 * 60 && evEnd > targetBed - 30 && evStart < targetBed + 180) {
      out.push({
        event: ev,
        conflictWith: "sleep",
        tradeOffNote: ev.movable
          ? `"${ev.title}" runs close to your ${fmtClock(targetBed)} sleep target.`
          : `"${ev.title}" ends at ${fmtClock(evEnd)}, so tonight's shift is capped to keep the commitment intact.`,
      });
    }
  }
  return out;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function fmtClock(min: number): string {
  const w = wrapClockMin(min);
  const h = Math.floor(w / 60);
  const m = w % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
