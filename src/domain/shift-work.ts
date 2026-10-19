// SHIFT mode — the rotating night-shift week.
//
// A traveller's problem is one flight and a fixed number of days. A shift
// worker's is a rotation: night shifts, a daytime job, a school pickup at
// 15:30, and no way to phase-advance a body clock that has to be awake at
// 03:00 tomorrow. The literature's answer for a short rotation is a stable
// partial compromise — an "anchor" sleep window held steady — rather than a
// full 12-hour flip that would wreck the days off.
//
// The seed below is authored: the commitments, the sleep windows and the
// copy are a real week, because a shift week is a life, not a formula. The
// *clock* is not authored. The body phase is stepped by the same
// phase-response model the scorer gates with (`modelShiftMin`), capped at the
// physiological ceiling, and the misalignment is the circular gap between the
// modelled body clock and the anchor window. The do-nothing baseline is the
// same chain with no light cues — the worker who just gets on with it.
//
// Two things this model deliberately does not do:
//
//   · it does not credit the sleep windows with moving the clock. A shift
//     worker's sleep window moves from 23:00 to 15:00 — a reversal of the
//     day, not a phase move, and a midpoint comparison reads it as a 9-hour
//     advance. The light cues do the work; the windows are the asks.
//   · it does not pretend a three-night rotation flips a clock. A week of
//     cues buys about an hour and a half of delay, and the number on the
//     dial says so. That is the honest answer, and it is the argument for
//     the anchor strategy over a full flip.
//
// Fixed constraints are fixed. Negotiable ones (the school pickup) are the
// ones the traveller can move, and moving one moves the numbers, not a
// caption.

import { MAX_SHIFT_MIN_PER_DAY, modelShiftMin } from "./circadian";
import {
  ALCOHOL_UNCERTAINTY_MIN,
  PER_DAY_SUPPORT_UNCERTAINTY_MIN,
  PHASE_UNCERTAINTY_MIN,
  SKIP_UNCERTAINTY_MIN,
  WEARABLE_PHASE_UNCERTAINTY_MIN,
  sleepMidpointMin,
  wrapClockMin,
} from "./misalignment";
import type { Intervention, InterventionKind } from "./types";

export type ShiftDayType = "day_work" | "night_shift" | "transition_off" | "day_off";

export interface ShiftCommitment {
  id: string;
  title: string;
  startMin: number;
  endMin: number;
  category: "work" | "commute" | "childcare" | "personal";
  /** Fixed constraints cannot be overwritten; negotiable ones can be swapped or handed off. */
  negotiable: boolean;
  active: boolean;
  tradeOffIfKept: string;
  tradeOffIfMoved?: string;
}

export interface ShiftPrimaryAction {
  id: string;
  kind: InterventionKind;
  title: string;
  timeWindow: string;
  startMin: number;
  endMin: number;
  shortReason: string;
  constraintNote: string;
}

export interface ShiftSecondaryMark {
  id: string;
  kind: InterventionKind;
  label: string;
  timeMin: number;
  note: string;
}

export interface ShiftDayPlan {
  dayIndex: number;
  label: string;
  date: string;
  dayType: ShiftDayType;
  dayTypeBadge: string;
  /** The sleep window the plan asks for, in local minutes. */
  plannedSleepStartMin: number;
  plannedSleepEndMin: number;
  /** How much sleep the plan asks for, in minutes. */
  plannedSleepMinutes: number;
  /** Optional recovery nap. */
  napWindow?: { startMin: number; endMin: number; label: string };
  /**
   * The night this week is working towards: the body clock that would make a
   * 22:00 shift feel like an evening. The gap to it is the number the dial
   * shows.
   */
  targetNightStartMin: number;
  targetNightEndMin: number;
  /** The wearer's day-off sleep — the ghost arc on the dial. */
  usualSleepStartMin: number;
  usualSleepEndMin: number;
  /** The modelled body clock, in local minutes. */
  estimatedBodySleepStartMin: number;
  estimatedBodySleepEndMin: number;
  /** Circular gap between the body clock and the anchor, in hours. */
  misalignmentHours: number;
  misalignmentLowHours: number;
  misalignmentHighHours: number;
  /** The same gap with no light cues at all. */
  baselineMisalignmentHours: number;
  uncertaintyHalfWidthMin: number;
  /** Minutes of phase shift the day's cues actually support. */
  modelledShiftMin: number;
  primaryAction: ShiftPrimaryAction;
  secondaryMarks: ShiftSecondaryMark[];
  commitments: ShiftCommitment[];
  postShiftSafetyWarning?: string;
  honestTradeOffNote: string;
}

export interface ShiftWeekOptions {
  /** Whether the partner covers the 15:30 school pickup on Thursday. */
  partnerCoversAfternoonPickup?: boolean;
  /** Whether an extra late-evening clinic is added on Wednesday. */
  lateSwapOnNightOne?: boolean;
  /** Days whose clock-moving action was skipped. */
  skippedDayIndices?: Set<number>;
  /** Days the traveller flagged drinking. */
  alcoholDayIndices?: Set<number>;
  /** Whether a wearable supplied the baseline. */
  wearableOptedIn?: boolean;
}

export const POST_SHIFT_DRIVING_WARNING =
  "Safety notice: Drowsiness after a night shift impairs reaction time during the morning commute, especially when driving home. Avoid driving if you feel sleepy, consider alternative transport or a brief pre-commute nap, and consult your occupational health service for personal guidance. Meridian cannot assess whether you are fit to drive.";

const H = (h: number, m = 0) => h * 60 + m;

const SCHOOL_PICKUP: ShiftCommitment = {
  id: "school-pickup",
  title: "School pickup",
  startMin: H(15, 30),
  endMin: H(16, 0),
  category: "childcare",
  negotiable: true,
  active: true,
  tradeOffIfKept: "The pickup pushes the pre-shift sleep an hour later, so you start the night on five hours, not six.",
  tradeOffIfMoved: "Handing the pickup over buys an extra hour of sleep before the last night shift.",
};

interface SeedDay {
  label: string;
  date: string;
  dayType: ShiftDayType;
  dayTypeBadge: string;
  /** The sleep window this day asks for. */
  sleepStartMin: number;
  sleepEndMin: number;
  /** The light cues of the day, placed by a protocol, not by the model. */
  interventions: Intervention[];
  primaryAction: ShiftPrimaryAction;
  secondaryMarks: ShiftSecondaryMark[];
  commitments: ShiftCommitment[];
  honestTradeOffNote: string;
  postShiftSafetyWarning?: string;
}

/**
 * The seed week. Times are local; the day labels match the dates
 * (19 Oct 2026 is a Monday).
 *
 * The cue times are the protocol's: bright light in the hour before the
 * night shift (a delay cue for a body still on day time), and dim light on
 * the morning drive home (which stops the morning from pulling the clock
 * back to days).
 */
const SEED: SeedDay[] = [
  {
    label: "Mon",
    date: "2026-10-19",
    dayType: "day_off",
    dayTypeBadge: "Pre-rotation day",
    sleepStartMin: H(23, 0),
    sleepEndMin: H(7, 0),
    interventions: [],
    primaryAction: {
      id: "mon-anchor",
      kind: "sleep_window",
      title: "Keep the full night",
      timeWindow: "23:00 – 07:00",
      startMin: H(23, 0),
      endMin: H(7, 0),
      shortReason: "A full night before the rotation is the anchor the week hangs on.",
      constraintNote: "Nothing to protect today — this is the sleep bank.",
    },
    secondaryMarks: [],
    commitments: [],
    honestTradeOffNote:
      "A full night before the first night shift. Tomorrow's early start is the price of the week's anchor.",
  },
  {
    label: "Tue",
    date: "2026-10-20",
    dayType: "night_shift",
    dayTypeBadge: "Night 1",
    sleepStartMin: H(16, 0),
    sleepEndMin: H(21, 0),
    interventions: [
      {
        kind: "light_exposure",
        startMin: H(21, 0),
        endMin: H(22, 0),
        note: "Bright light in the hour before the shift — the delay cue.",
      },
      {
        kind: "avoid_light",
        startMin: H(6, 30),
        endMin: H(7, 30),
        note: "Dark glasses on the drive home — morning light pulls the clock back to days.",
      },
    ],
    primaryAction: {
      id: "tue-light",
      kind: "light_exposure",
      title: "Bright light before the shift",
      timeWindow: "21:00 – 22:00",
      startMin: H(21, 0),
      endMin: H(22, 0),
      shortReason: "Light in the hour before a night shift pushes the clock toward working nights.",
      constraintNote: "The commute home is the other half of tonight's trade.",
    },
    secondaryMarks: [
      {
        id: "tue-shades",
        kind: "avoid_light",
        label: "Dark shades on the drive home",
        timeMin: H(6, 30),
        note: "Morning light works against the night phase.",
      },
    ],
    commitments: [
      {
        id: "tue-shift",
        title: "Night shift",
        startMin: H(22, 0),
        endMin: H(6, 0),
        category: "work",
        negotiable: false,
        active: true,
        tradeOffIfKept: "Fixed. The night shift sets the shape of the whole week.",
      },
      {
        id: "tue-commute",
        title: "Drive home",
        startMin: H(6, 0),
        endMin: H(6, 45),
        category: "commute",
        negotiable: false,
        active: true,
        tradeOffIfKept: "Fixed, and the drowsy one. This is the drive to take seriously.",
      },
    ],
    honestTradeOffNote:
      "The first night shift costs the most: your body is still on day time, so tonight's sleep will be broken.",
    postShiftSafetyWarning: POST_SHIFT_DRIVING_WARNING,
  },
  {
    label: "Wed",
    date: "2026-10-21",
    dayType: "night_shift",
    dayTypeBadge: "Night 2",
    sleepStartMin: H(16, 0),
    sleepEndMin: H(21, 0),
    interventions: [
      {
        kind: "light_exposure",
        startMin: H(21, 0),
        endMin: H(22, 0),
        note: "Bright light in the hour before the shift.",
      },
      {
        kind: "avoid_light",
        startMin: H(6, 30),
        endMin: H(7, 30),
        note: "Dark glasses on the drive home.",
      },
    ],
    primaryAction: {
      id: "wed-light",
      kind: "light_exposure",
      title: "Bright light before the shift",
      timeWindow: "21:00 – 22:00",
      startMin: H(21, 0),
      endMin: H(22, 0),
      shortReason: "Same cue as last night — repetition is what holds the phase.",
      constraintNote: "The late clinic is the one thing that can still move.",
    },
    secondaryMarks: [
      {
        id: "wed-shades",
        kind: "avoid_light",
        label: "Dark shades on the drive home",
        timeMin: H(6, 30),
        note: "Morning light works against the night phase.",
      },
    ],
    commitments: [
      {
        id: "wed-shift",
        title: "Night shift",
        startMin: H(22, 0),
        endMin: H(6, 0),
        category: "work",
        negotiable: false,
        active: true,
        tradeOffIfKept: "Fixed.",
      },
    ],
    honestTradeOffNote:
      "Two nights in, the body gives the daytime sleep a little more ground — but not the eight hours it wants.",
  },
  {
    label: "Thu",
    date: "2026-10-22",
    dayType: "night_shift",
    dayTypeBadge: "Night 3",
    sleepStartMin: H(16, 0),
    sleepEndMin: H(21, 0),
    interventions: [
      {
        kind: "light_exposure",
        startMin: H(21, 0),
        endMin: H(22, 0),
        note: "Bright light in the hour before the shift.",
      },
      {
        kind: "avoid_light",
        startMin: H(6, 30),
        endMin: H(7, 30),
        note: "Dark glasses on the drive home.",
      },
    ],
    primaryAction: {
      id: "thu-light",
      kind: "light_exposure",
      title: "Bright light before the shift",
      timeWindow: "21:00 – 22:00",
      startMin: H(21, 0),
      endMin: H(22, 0),
      shortReason: "The last night shift of the run — the cue that carries you into the days off.",
      constraintNote: "The 15:30 pickup is the one thing that can still move.",
    },
    secondaryMarks: [
      {
        id: "thu-shades",
        kind: "avoid_light",
        label: "Dark shades on the drive home",
        timeMin: H(6, 30),
        note: "Morning light works against the night phase.",
      },
    ],
    commitments: [
      {
        id: "thu-shift",
        title: "Night shift",
        startMin: H(22, 0),
        endMin: H(6, 0),
        category: "work",
        negotiable: false,
        active: true,
        tradeOffIfKept: "Fixed.",
      },
      SCHOOL_PICKUP,
    ],
    honestTradeOffNote:
      "The school pickup is the one movable thing in the week. It decides how much of the pre-shift sleep survives.",
  },
  {
    label: "Fri",
    date: "2026-10-23",
    dayType: "day_off",
    dayTypeBadge: "Recovery day",
    sleepStartMin: H(2, 0),
    sleepEndMin: H(10, 0),
    interventions: [
      {
        kind: "avoid_light",
        startMin: H(10, 0),
        endMin: H(11, 0),
        note: "Dim light in the hour after waking — the cue that lets the night phase unwind.",
      },
    ],
    primaryAction: {
      id: "fri-anchor",
      kind: "avoid_light",
      title: "Keep the first hour dim",
      timeWindow: "10:00 – 11:00",
      startMin: H(10, 0),
      endMin: H(11, 0),
      shortReason: "The recovery day is what holds the phase for the next rotation.",
      constraintNote: "This is the one day you can protect completely.",
    },
    secondaryMarks: [],
    commitments: [
      {
        id: "fri-school",
        title: "School pickup",
        startMin: H(15, 30),
        endMin: H(16, 0),
        category: "childcare",
        negotiable: true,
        active: true,
        tradeOffIfKept: "Afternoons are yours again — the anchor sleep is the better use of them.",
      },
    ],
    honestTradeOffNote:
      "A day off after three nights is a recovery day. Sleeping late is the plan, not a failure of it.",
  },
  {
    label: "Sat",
    date: "2026-10-24",
    dayType: "day_work",
    dayTypeBadge: "Day work",
    sleepStartMin: H(2, 30),
    sleepEndMin: H(10, 30),
    interventions: [
      {
        kind: "avoid_light",
        startMin: H(10, 30),
        endMin: H(11, 30),
        note: "Dim light in the hour after waking.",
      },
    ],
    primaryAction: {
      id: "sat-dim",
      kind: "avoid_light",
      title: "Keep the first hour dim",
      timeWindow: "10:30 – 11:30",
      startMin: H(10, 30),
      endMin: H(11, 30),
      shortReason: "You are back on a day schedule; the dim hour buys the transition.",
      constraintNote: "A daytime job means the daytime is no longer yours to spend asleep.",
    },
    secondaryMarks: [],
    commitments: [
      {
        id: "sat-work",
        title: "Day work",
        startMin: H(11, 30),
        endMin: H(18, 0),
        category: "work",
        negotiable: false,
        active: true,
        tradeOffIfKept:
          "Fixed. This is the cost of the anchor strategy: you keep days, at the price of a late body clock.",
      },
    ],
    honestTradeOffNote:
      "Back to a day job one day after the last night shift. The anchor strategy trades a full flip for a permanently late body clock.",
  },
  {
    label: "Sun",
    date: "2026-10-25",
    dayType: "transition_off",
    dayTypeBadge: "Transition day",
    sleepStartMin: H(1, 0),
    sleepEndMin: H(9, 0),
    interventions: [
      {
        kind: "avoid_light",
        startMin: H(9, 0),
        endMin: H(10, 0),
        note: "Dim light in the hour after waking.",
      },
    ],
    primaryAction: {
      id: "sun-dim",
      kind: "avoid_light",
      title: "Keep the first hour dim",
      timeWindow: "09:00 – 10:00",
      startMin: H(9, 0),
      endMin: H(10, 0),
      shortReason: "The rotation ends here; the last dim hour is what keeps the gain.",
      constraintNote: "The next rotation starts Monday — this is the bridge.",
    },
    secondaryMarks: [],
    commitments: [
      {
        id: "sun-family",
        title: "Family day",
        startMin: H(11, 0),
        endMin: H(19, 0),
        category: "personal",
        negotiable: true,
        active: true,
        tradeOffIfKept: "Fine — the plan only asks for one dim hour.",
      },
    ],
    honestTradeOffNote:
      "The week ends where it started: late nights, early sleeps, and a body clock that is not where the calendar says it is.",
  },
];

/**
 * The night this week works towards: asleep in the afternoon, awake for the
 * shift. Its midpoint is where the body clock would have to sit for a 22:00
 * start to feel like an evening.
 */
const NIGHT_TARGET = { startMin: H(14, 0), endMin: H(22, 0) };
/** The wearer's day-off sleep, the ghost arc. */
const USUAL = { startMin: H(23, 0), endMin: H(7, 0) };

/**
 * Minutes of delay still owed to reach a target clock time.
 *
 * Delay is one-directional, so this is a forward distance rather than the
 * shorter way round the clock: a body reading 03:20 that needs to read 18:30
 * is fifteen hours of delay away, not nine.
 */
export function delayOwedMin(bodyMid: number, targetMid: number): number {
  return wrapClockMin(targetMid - bodyMid);
}

/**
 * Build the seven days of the rotating shift week.
 *
 * The seed is authored; the clock is computed. Each day the body phase steps
 * by what that day's light cues support — judged by the same phase-response
 * model the scorer uses — and the gap to the anchor window falls out of that.
 */
export function buildShiftWeekPlan(options: ShiftWeekOptions = {}): ShiftDayPlan[] {
  const {
    partnerCoversAfternoonPickup = false,
    lateSwapOnNightOne = false,
    skippedDayIndices = new Set(),
    alcoholDayIndices = new Set(),
    wearableOptedIn = false,
  } = options;

  const seeds: SeedDay[] = SEED.map((d, i) => {
    if (i !== 3) return d;
    // The one movable thing in the week: handing over the school pickup buys
    // an extra hour of sleep before the last night shift.
    if (!partnerCoversAfternoonPickup) return d;
    return {
      ...d,
      sleepStartMin: H(15, 0),
      commitments: d.commitments.map((c) =>
        c.id === "school-pickup"
          ? {
              ...c,
              active: false,
              tradeOffIfMoved:
                "Handed to your partner — an extra hour of sleep before the last night shift.",
            }
          : c,
      ),
      honestTradeOffNote:
        "The pickup is covered, so tonight's sleep starts an hour earlier. That is the whole trade.",
    };
  });

  // Body clock: starts at the day-off sleep and steps by what the day's cues
  // support. The baseline is the same week with no light cues at all.
  let bodyStart = USUAL.startMin;
  let bodyEnd = USUAL.endMin;
  let variance = 0;

  return seeds.map((seed, idx) => {
    const isSkipped = skippedDayIndices.has(idx);
    const hasAlcohol = alcoholDayIndices.has(idx);

    // The day's cues, as the phase-response model sees them. The sleep window
    // is not a zeitgeber here: a shift worker's window moves from 23:00 to
    // 15:00, which is a reversal of the day rather than a phase move.
    const cues = isSkipped
      ? seed.interventions.filter((iv) => iv.kind === "light_exposure")
      : seed.interventions;
    const support = modelShiftMin(
      {
        dayIndex: idx,
        label: seed.label,
        shiftMin: 0,
        targetBedtimeMin: seed.sleepStartMin,
        targetWakeMin: seed.sleepEndMin,
        interventions: cues,
      },
      undefined,
      { wakeMin: bodyEnd },
    );
    const modelledShiftMin = Math.max(
      -MAX_SHIFT_MIN_PER_DAY,
      Math.min(MAX_SHIFT_MIN_PER_DAY, support),
    );
    bodyStart = wrapClockMin(bodyStart + modelledShiftMin);
    bodyEnd = wrapClockMin(bodyEnd + modelledShiftMin);

    variance += PER_DAY_SUPPORT_UNCERTAINTY_MIN ** 2;
    const uncertaintyHalfWidthMin = Math.min(
      90,
      Math.round(
        (wearableOptedIn ? WEARABLE_PHASE_UNCERTAINTY_MIN : PHASE_UNCERTAINTY_MIN) +
          Math.sqrt(variance) +
          (isSkipped ? SKIP_UNCERTAINTY_MIN : 0) +
          (hasAlcohol ? ALCOHOL_UNCERTAINTY_MIN : 0),
      ),
    );

    const bodyMid = sleepMidpointMin(bodyStart, bodyEnd);
    // The do-nothing baseline: the same week with no light cues, so the body
    // never leaves its day-off schedule.
    const baseMid = sleepMidpointMin(USUAL.startMin, USUAL.endMin);
    const targetMid = sleepMidpointMin(NIGHT_TARGET.startMin, NIGHT_TARGET.endMin);
    // A delay metric, not a circular distance: a body that is nine hours
    // "round the clock" from working nights is fifteen hours of delay away,
    // and delay is the only direction a night worker can move in.
    const gapH = Math.round((delayOwedMin(bodyMid, targetMid) / 60) * 10) / 10;
    const baseGapH = Math.round((delayOwedMin(baseMid, targetMid) / 60) * 10) / 10;
    const halfBand = uncertaintyHalfWidthMin / 60;

    const commitments = seed.commitments.map((c) => ({ ...c }));
    if (lateSwapOnNightOne && idx === 2) {
      commitments.push({
        id: "wed-clinic",
        title: "Late clinic",
        startMin: H(21, 30),
        endMin: H(22, 0),
        category: "personal",
        negotiable: true,
        active: true,
        tradeOffIfKept: "It eats the last half hour before the shift, so tonight's light cue is later.",
        tradeOffIfMoved: "Moving it keeps the light cue where it works.",
      });
    }

    const sleepMinutes = wrapClockMin(seed.sleepEndMin - seed.sleepStartMin);

    return {
      dayIndex: idx,
      label: seed.label,
      date: seed.date,
      dayType: seed.dayType,
      dayTypeBadge: seed.dayTypeBadge,
      plannedSleepStartMin: seed.sleepStartMin,
      plannedSleepEndMin: seed.sleepEndMin,
      plannedSleepMinutes: sleepMinutes,
      targetNightStartMin: NIGHT_TARGET.startMin,
      targetNightEndMin: NIGHT_TARGET.endMin,
      usualSleepStartMin: USUAL.startMin,
      usualSleepEndMin: USUAL.endMin,
      estimatedBodySleepStartMin: bodyStart,
      estimatedBodySleepEndMin: bodyEnd,
      misalignmentHours: gapH,
      misalignmentLowHours: Math.round(Math.max(0, gapH - halfBand) * 10) / 10,
      misalignmentHighHours: Math.round((gapH + halfBand) * 10) / 10,
      baselineMisalignmentHours: baseGapH,
      uncertaintyHalfWidthMin,
      modelledShiftMin,
      primaryAction: seed.primaryAction,
      secondaryMarks: seed.secondaryMarks,
      commitments,
      postShiftSafetyWarning: seed.postShiftSafetyWarning,
      honestTradeOffNote: seed.honestTradeOffNote,
    } satisfies ShiftDayPlan;
  });
}
