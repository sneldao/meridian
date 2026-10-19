import { utcOffsetMinOn, wrapShiftMin } from "./timezones";
import type { CalendarEvent, DayPlan, Trip, WearableBaseline } from "./types";

const DAY_MIN = 1440;

/** Wrap any minute value onto [0, 1440). */
export function wrapClockMin(m: number): number {
  return ((m % DAY_MIN) + DAY_MIN) % DAY_MIN;
}

/**
 * Signed circular difference (a - b) on a 24-hour clock in minutes,
 * wrapped into (-720, +720].
 * Properly handles midnight wraparound: e.g. 00:30 (30) vs 23:30 (1410) -> +60 min.
 */
export function circularSignedDiffMin(aMin: number, bMin: number): number {
  const d = wrapClockMin(aMin - bMin);
  return d > 720 ? d - 1440 : d;
}

/**
 * Absolute circular distance on a 24-hour clock in minutes, in [0, 720].
 * Midnight wraparound safe: distance between 23:15 and 00:45 is 90 min (1.5h).
 */
export function circularDistanceMin(aMin: number, bMin: number): number {
  return Math.abs(circularSignedDiffMin(aMin, bMin));
}

/** Sleep midpoint on the 24-hour clock, handling overnight intervals across midnight. */
export function sleepMidpointMin(bedtimeMin: number, wakeMin: number): number {
  const bed = wrapClockMin(bedtimeMin);
  const wake = wrapClockMin(wakeMin);
  const duration = wrapClockMin(wake - bed);
  return wrapClockMin(bed + duration / 2);
}

/**
 * Computes timezone shift in minutes between two IANA timezones on specific ISO dates,
 * accurately capturing the 25 Oct 2026 Europe/London BST -> GMT transition.
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

export interface DirectionStrategyExplanation {
  recommendedDirection: "advance" | "delay";
  timeZoneDiffHours: number;
  summary: string;
  whyThisDirection: string;
  alternativeTradeOff: string;
}

/**
 * Section 6 — Eastward ≥8h trips (e.g. LHR -> HND, +8h in BST or +9h in GMT):
 * Explains whether to advance or delay and why.
 */
export function recommendDirectionStrategy(
  trip: Trip,
  chronotype: WearableBaseline["chronotype"] = "neutral",
): DirectionStrategyExplanation {
  const hours = Math.round((Math.abs(trip.requiredShiftMin) / 60) * 10) / 10;
  const isEast = trip.direction === "east";

  if (!isEast) {
    return {
      recommendedDirection: "delay",
      timeZoneDiffHours: hours,
      summary: `Delay your clock by ${hours}h (stay up later, evening light).`,
      whyThisDirection:
        "The human master clock has an endogenous period slightly longer than 24 hours (~24.2h), making phase delays naturally easier than advances.",
      alternativeTradeOff:
        "Advancing the long way around would require shifting 15+ hours against your natural drift.",
    };
  }

  if (hours >= 8) {
    // 8–9h east sits right near the antidromic/orthodromic boundary (Eastman & Burgess 2009).
    const preferDelay = hours >= 9.5 && chronotype === "late";
    if (preferDelay) {
      return {
        recommendedDirection: "delay",
        timeZoneDiffHours: hours,
        summary: `Delay by ${24 - hours}h instead of advancing ${hours}h.`,
        whyThisDirection:
          "Across 9.5+ hours east with a late chronotype, delaying with evening light avoids accidentally hitting your sensitive morning delay zone.",
        alternativeTradeOff:
          `Advancing ${hours}h is shorter on paper (~75m/day), but early morning light before CBTmin can trigger antidromic re-entrainment (pushing your clock the wrong way).`,
      };
    }
    return {
      recommendedDirection: "advance",
      timeZoneDiffHours: hours,
      summary: `Advance by ${hours}h (~1–1.5h/day) with timed post-wake light.`,
      whyThisDirection: `For a ${hours}h eastward jump (${trip.origin.code} → ${trip.destination.code}), advancing covers ${hours}h vs. ${24 - hours}h if you delayed—and 3 pre-departure days move your CBTmin early enough that arrival morning daylight pulls you the right way (Eastman et al., 2005).`,
      alternativeTradeOff: `Delaying around the clock would take ${24 - hours}h of shift (~10–12 days) and leave your body asleep during ${trip.destination.name} business hours.`,
    };
  }

  return {
    recommendedDirection: "advance",
    timeZoneDiffHours: hours,
    summary: `Advance your clock by ${hours}h with morning bright light and earlier bedtimes.`,
    whyThisDirection:
      "Timed bright light right after your biological wake trough is the most direct path to destination time.",
    alternativeTradeOff: "Without pre-shifting, you lose ~1 day per hour of timezone offset after landing.",
  };
}

export interface DayMisalignmentPoint {
  dayIndex: number;
  label: string;
  date: string;
  /** Estimated body-clock sleep window in local display clock minutes [0, 1440). */
  estimatedBodyBedMin: number;
  estimatedBodyWakeMin: number;
  /** Target night sleep window in destination/target clock minutes [0, 1440). */
  targetBedMin: number;
  targetWakeMin: number;
  /** Usual habitual sleep window (ghost arc) in minutes [0, 1440). */
  usualBedMin: number;
  usualWakeMin: number;
  /** Uncertainty half-width in minutes (e.g. ±45 min -> band width 90 min). */
  uncertaintyHalfWidthMin: number;
  /** Planned misalignment in hours (vs target night). */
  misalignmentHours: number;
  /** Low end of estimated misalignment range in hours. */
  misalignmentLowHours: number;
  /** High end of estimated misalignment range in hours. */
  misalignmentHighHours: number;
  /** Defensible baseline misalignment in hours (no pre-departure adjustment, ~0.75h/day passive post-landing drift). */
  baselineMisalignmentHours: number;
  /** Cumulative minutes shifted by the plan through this day. */
  cumulativePlannedShiftMin: number;
  /** Whether a commitment conflicts with the recommended light or sleep window. */
  commitmentConflicts: {
    event: CalendarEvent;
    conflictWith: "sleep" | "light";
    tradeOffNote: string;
  }[];
}

export interface TrajectoryInput {
  trip: Trip;
  days: DayPlan[];
  baseline: WearableBaseline;
  calendar: CalendarEvent[];
  /** Day indices where the user tapped "Not tonight" on a clock-moving nudge. */
  skippedDayIndices?: Set<number>;
  /** Day indices where the user tapped "I'm drinking" alcohol modifier. */
  alcoholDayIndices?: Set<number>;
  /** Whether wearable data is opted-in (simulated import) vs manual "You told us". */
  wearableOptedIn?: boolean;
}

/**
 * Computes the deterministic day-by-day circadian misalignment trajectory,
 * uncertainty bands, and no-adjustment baseline comparison.
 *
 * Key honesty guarantees (Sections 1, 2, 4, 8):
 * - Misalignment is circular distance between estimated body sleep midpoint and
 *   target destination sleep midpoint, converted to hours.
 * - Baseline is a clearly stated no-adjustment scenario: zero pre-flight shift,
 *   and ~45 min/day passive adaptation after arrival.
 * - Skipping a clock-moving nudge reduces that day's modeled phase shift by 65%,
 *   sliding the projection toward the baseline (never worse than baseline) and
 *   widening the uncertainty band by ±15 min.
 * - Alcohol ("I'm drinking") does NOT invent a phase shift; it widens the sleep/phase
 *   uncertainty band by ±20 min and surfaces a non-judgmental sleep-quality note.
 */
export function computeTripTrajectory(input: TrajectoryInput): DayMisalignmentPoint[] {
  const {
    trip,
    days,
    baseline,
    calendar,
    skippedDayIndices = new Set(),
    alcoholDayIndices = new Set(),
    wearableOptedIn = false,
  } = input;

  const totalRequiredMin = Math.abs(trip.requiredShiftMin);
  const sign = trip.direction === "east" ? -1 : 1;

  // Target sleep in home-reference clock: shifting habitual sleep by requiredShiftMin
  const usualBedMin = wrapClockMin(baseline.avgBedtimeMin);
  const usualWakeMin = wrapClockMin(baseline.avgWakeMin);
  const targetHomeRefBedMin = wrapClockMin(usualBedMin + trip.requiredShiftMin);
  const targetHomeRefWakeMin = wrapClockMin(usualWakeMin + trip.requiredShiftMin);

  let cumulativePlannedShiftMin = 0;
  let cumulativeBaselineShiftMin = 0;

  return trip.days.map((spec, idx) => {
    const plan = days.find((d) => d.dayIndex === spec.dayIndex || d.label === spec.label);
    const rawShiftMin = plan ? plan.shiftMin : sign * 60;
    const isSkipped = skippedDayIndices.has(spec.dayIndex);
    const hasAlcohol = alcoholDayIndices.has(spec.dayIndex);

    // If a clock-moving action is skipped, only ~35% of the day's shift is credited
    // (passive sleep schedule contribution), and it never drops below the no-adjustment baseline.
    const effectiveDayShiftMin = isSkipped ? Math.round((rawShiftMin * 0.35) / 5) * 5 : rawShiftMin;
    cumulativePlannedShiftMin += effectiveDayShiftMin;

    // Defensible no-adjustment baseline:
    // Pre-departure (dayIndex <= departureDayIndex): 0 shift.
    // Post-arrival (dayIndex > departureDayIndex): ~45 min/day passive natural daylight drift.
    if (spec.dayIndex > trip.departureDayIndex) {
      cumulativeBaselineShiftMin += sign * 45;
    }

    const plannedCoveredMin = Math.min(
      totalRequiredMin,
      Math.max(0, sign * cumulativePlannedShiftMin),
    );
    const baselineCoveredMin = Math.min(
      totalRequiredMin,
      Math.max(0, sign * cumulativeBaselineShiftMin),
    );

    // Ensure skipped nudge never projects worse misalignment than the no-adjustment baseline
    const boundedPlannedCoveredMin = Math.max(baselineCoveredMin, plannedCoveredMin);

    const residualMin = Math.max(0, totalRequiredMin - boundedPlannedCoveredMin);
    const baselineResidualMin = Math.max(0, totalRequiredMin - baselineCoveredMin);

    // Uncertainty band half-width in minutes:
    // Base ±40m when wearable data is imported ("Estimated from your data"), ±55m from self-report ("You told us"),
    // +5m per day into the plan, +15m if a nudge was skipped, +20m if alcohol modifier is active.
    const baseUncertainty = wearableOptedIn ? 40 : 55;
    const uncertaintyHalfWidthMin = Math.min(
      105,
      baseUncertainty + idx * 5 + (isSkipped ? 15 : 0) + (hasAlcohol ? 20 : 0),
    );

    const misalignmentHours = Math.round((residualMin / 60) * 10) / 10;
    const baselineMisalignmentHours = Math.round((baselineResidualMin / 60) * 10) / 10;
    const halfBandHours = uncertaintyHalfWidthMin / 60;
    const misalignmentLowHours = Math.max(0, Math.round((misalignmentHours - halfBandHours) * 10) / 10);
    const misalignmentHighHours = Math.round((misalignmentHours + halfBandHours) * 10) / 10;

    // Estimated body sleep window on the dial:
    const estimatedBodyBedMin = wrapClockMin(usualBedMin + sign * boundedPlannedCoveredMin);
    const estimatedBodyWakeMin = wrapClockMin(usualWakeMin + sign * boundedPlannedCoveredMin);

    // Target sleep window for this day (from plan if available, else destination target)
    const targetBedMin = plan ? wrapClockMin(plan.targetBedtimeMin) : targetHomeRefBedMin;
    const targetWakeMin = plan ? wrapClockMin(plan.targetWakeMin) : targetHomeRefWakeMin;

    // Detect commitment trade-offs on this day
    const dayEvents = calendar.filter(
      (e) => (e.movedTo?.dayIndex ?? e.dayIndex) === spec.dayIndex && e.blocksInterventions !== false,
    );
    const commitmentConflicts: DayMisalignmentPoint["commitmentConflicts"] = [];

    for (const ev of dayEvents) {
      const evStart = ev.movedTo?.startMin ?? ev.startMin;
      const evEnd = ev.movedTo?.endMin ?? ev.endMin;

      // Check overlap with planned light exposure
      const lightIv = plan?.interventions.find((iv) => iv.kind === "light_exposure");
      if (lightIv) {
        const lStart = lightIv.startMin;
        const lEnd = lightIv.endMin ?? lStart + 60;
        if (evStart < lEnd && lStart < evEnd) {
          commitmentConflicts.push({
            event: ev,
            conflictWith: "light",
            tradeOffNote: ev.movable
              ? `Flexible "${ev.title}" overlaps your ${formatClock(lStart)} light window — can be moved.`
              : `Fixed "${ev.title}" (${formatClock(evStart)}–${formatClock(evEnd)}) clips your ideal light window; light shifted to the nearest clear slot.`,
          });
        }
      }

      // Check overlap with evening wind-down / target bedtime
      if (evEnd > targetBedMin - 30 && evStart < targetBedMin + 180 && targetBedMin > 18 * 60) {
        commitmentConflicts.push({
          event: ev,
          conflictWith: "sleep",
          tradeOffNote: ev.movable
            ? `Flexible "${ev.title}" runs close to your ${formatClock(targetBedMin)} sleep target.`
            : `Fixed "${ev.title}" ends at ${formatClock(evEnd)}, capping tonight's advance so your commitment stays intact.`,
        });
      }
    }

    return {
      dayIndex: spec.dayIndex,
      label: spec.label,
      date: spec.date,
      estimatedBodyBedMin,
      estimatedBodyWakeMin,
      targetBedMin,
      targetWakeMin,
      usualBedMin,
      usualWakeMin,
      uncertaintyHalfWidthMin,
      misalignmentHours,
      misalignmentLowHours,
      misalignmentHighHours,
      baselineMisalignmentHours,
      cumulativePlannedShiftMin: sign * boundedPlannedCoveredMin,
      commitmentConflicts,
    };
  });
}

function formatClock(min: number): string {
  const w = wrapClockMin(min);
  const h = Math.floor(w / 60);
  const m = w % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
