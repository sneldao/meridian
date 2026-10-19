import type { InterventionKind } from "./types";

/**
 * Section 7 — SHIFT Mode: Serious, and different from TRIP.
 * Designed around rotating night shifts, daytime work, childcare, and limited
 * flexibility. Distinguishes fixed vs. negotiable constraints, anchor sleep on
 * days off, protected sleep windows, and a serious post-shift driving warning.
 */

export type ShiftDayType = "day_work" | "night_shift" | "transition_off" | "day_off";

export interface ShiftCommitment {
  id: string;
  title: string;
  startMin: number;
  endMin: number;
  category: "work" | "commute" | "childcare" | "personal";
  /** Fixed constraints cannot be overwritten; negotiable ones can be swapped/handed off. */
  negotiable: boolean;
  active: boolean;
  tradeOffIfKept: string;
  tradeOffIfMoved?: string;
}

export interface ShiftDayPlan {
  dayIndex: number;
  label: string; // "Mon" .. "Sun"
  date: string;
  dayType: ShiftDayType;
  dayTypeBadge: string;
  /** Planned primary sleep window in minutes [0, 1440). */
  plannedSleepStartMin: number;
  plannedSleepEndMin: number;
  /** Optional recovery nap window (e.g. transition day or pre-night shift). */
  napWindow?: { startMin: number; endMin: number; label: string };
  /** Target anchor night window (the stable partial compromise window). */
  targetAnchorStartMin: number;
  targetAnchorEndMin: number;
  /** Usual day-off sleep window (ghost arc). */
  usualSleepStartMin: number;
  usualSleepEndMin: number;
  /** Estimated body-clock sleep midpoint / window & uncertainty. */
  estimatedBodySleepStartMin: number;
  estimatedBodySleepEndMin: number;
  uncertaintyHalfWidthMin: number;
  /** Misalignment hours vs target anchor/sleep window. */
  misalignmentHours: number;
  misalignmentLowHours: number;
  misalignmentHighHours: number;
  baselineMisalignmentHours: number;
  /** Primary daily action (<20 words body copy). */
  primaryAction: {
    id: string;
    kind: InterventionKind;
    title: string;
    timeWindow: string;
    startMin: number;
    endMin: number;
    shortReason: string;
    constraintNote: string;
  };
  /** Secondary dial marks. */
  secondaryMarks: {
    id: string;
    kind: InterventionKind;
    label: string;
    timeMin: number;
    note: string;
  }[];
  commitments: ShiftCommitment[];
  /** Serious post-night-shift drowsiness warning when applicable. */
  postShiftSafetyWarning?: string;
  /** Honest note when constraints prevent an ideal 8h block. */
  honestTradeOffNote: string;
}

export interface ShiftWeekOptions {
  /** Interactive adaptation: whether the partner/grandparent covers the 15:30 childcare pickup on Thu (Night 2). */
  partnerCoversAfternoonPickup?: boolean;
  /** Interactive adaptation: whether an extra late-evening clinic/call is added on Wed. */
  lateSwapOnNightOne?: boolean;
  skippedDayIndices?: Set<number>;
  alcoholDayIndices?: Set<number>;
}

export const POST_SHIFT_DRIVING_WARNING =
  "Safety notice: Drowsiness after a night shift impairs reaction time during the morning commute, especially when driving home. Avoid driving if you feel sleepy, consider alternative transport or a brief pre-commute nap, and consult your occupational health service for personal guidance. Meridian cannot assess whether you are fit to drive.";

/**
 * Builds the 7-day rotating night-shift + childcare seed plan (Mon–Sun).
 * Strategy: Stable partial phase delay ("Anchor Sleep" compromise, Eastman & Burgess / AASM)
 * rather than attempting a full 12-hour body-clock flip for only 3 night shifts.
 */
export function buildShiftWeekPlan(options: ShiftWeekOptions = {}): ShiftDayPlan[] {
  const {
    partnerCoversAfternoonPickup = false,
    skippedDayIndices = new Set(),
    alcoholDayIndices = new Set(),
  } = options;

  const baseDays: Omit<
    ShiftDayPlan,
    "misalignmentLowHours" | "misalignmentHighHours" | "uncertaintyHalfWidthMin"
  >[] = [
    {
      dayIndex: 0,
      label: "Mon",
      date: "2026-10-19",
      dayType: "day_off",
      dayTypeBadge: "Pre-Rotation Day",
      plannedSleepStartMin: 23 * 60 + 30,
      plannedSleepEndMin: 7 * 60 + 15,
      targetAnchorStartMin: 0 * 60 + 30,
      targetAnchorEndMin: 8 * 60 + 0,
      usualSleepStartMin: 23 * 60 + 0,
      usualSleepEndMin: 6 * 60 + 45,
      estimatedBodySleepStartMin: 23 * 60 + 15,
      estimatedBodySleepEndMin: 7 * 60 + 0,
      misalignmentHours: 1.0,
      baselineMisalignmentHours: 1.5,
      primaryAction: {
        id: "shift-mon-sleep",
        kind: "sleep_window",
        title: "Bank a full night & delay bedtime to 23:30",
        timeWindow: "23:30 – 07:15",
        startMin: 23 * 60 + 30,
        endMin: 7 * 60 + 15,
        shortReason: "Starts a gentle 1h delay before tomorrow's first night shift while keeping morning school drop-off.",
        constraintNote: "Fixed 07:45 school drop-off caps how late you can sleep in.",
      },
      secondaryMarks: [
        { id: "mon-light", kind: "light_exposure", label: "Evening bright light", timeMin: 20 * 60, note: "Bright indoor light 20:00–21:30 nudges your clock slightly later." },
        { id: "mon-caf", kind: "caffeine_cutoff", label: "Last caffeine 15:30", timeMin: 15 * 60 + 30, note: "8h before 23:30 bedtime." },
      ],
      commitments: [
        {
          id: "mon-school",
          title: "School drop-off (Fixed)",
          startMin: 7 * 60 + 45,
          endMin: 8 * 60 + 30,
          category: "childcare",
          negotiable: false,
          active: true,
          tradeOffIfKept: "Caps morning sleep at 07:15.",
        },
        {
          id: "mon-pickup",
          title: "School pickup",
          startMin: 15 * 60 + 30,
          endMin: 16 * 60 + 15,
          category: "childcare",
          negotiable: true,
          active: true,
          tradeOffIfKept: "Daytime free; no sleep conflict on Monday.",
        },
      ],
      honestTradeOffNote:
        "With 3 night shifts ahead and fixed family mornings, a partial phase delay + anchor sleep is more realistic than fully flipping your clock.",
    },
    {
      dayIndex: 1,
      label: "Tue",
      date: "2026-10-20",
      dayType: "night_shift",
      dayTypeBadge: "Night 1 (22:00–06:00)",
      plannedSleepStartMin: 23 * 60 + 30,
      plannedSleepEndMin: 7 * 60 + 15,
      napWindow: {
        startMin: 14 * 60 + 0,
        endMin: 15 * 60 + 15,
        label: "Prophylactic pre-shift nap (75m)",
      },
      targetAnchorStartMin: 8 * 60 + 45,
      targetAnchorEndMin: 14 * 60 + 30,
      usualSleepStartMin: 23 * 60 + 0,
      usualSleepEndMin: 6 * 60 + 45,
      estimatedBodySleepStartMin: 0 * 60 + 15,
      estimatedBodySleepEndMin: 8 * 60 + 0,
      misalignmentHours: 4.5,
      baselineMisalignmentHours: 6.0,
      primaryAction: {
        id: "shift-tue-nap",
        kind: "nap",
        title: "Take a 75-min pre-shift nap before school pickup",
        timeWindow: "14:00 – 15:15",
        startMin: 14 * 60,
        endMin: 15 * 60 + 15,
        shortReason: "Reduces homeostatic sleep pressure through your first 22:00–06:00 hospital shift.",
        constraintNote: "Ends at 15:15 so you make the 15:30 school pickup.",
      },
      secondaryMarks: [
        { id: "tue-light", kind: "light_exposure", label: "Early-shift bright light", timeMin: 23 * 60, note: "Bright overhead light 22:30–01:00 supports alertness." },
        { id: "tue-caf", kind: "caffeine_cutoff", label: "Last shift coffee 01:30", timeMin: 1 * 60 + 30, note: "Cut caffeine by 01:30 so you can sleep at 08:45 after school drop-off." },
      ],
      commitments: [
        {
          id: "tue-pickup",
          title: "School pickup",
          startMin: 15 * 60 + 30,
          endMin: 16 * 60 + 15,
          category: "childcare",
          negotiable: true,
          active: true,
          tradeOffIfKept: "Requires finishing pre-shift nap by 15:15.",
        },
        {
          id: "tue-shift",
          title: "Night Shift 1 (Hospital Ward)",
          startMin: 22 * 60,
          endMin: 6 * 60,
          category: "work",
          negotiable: false,
          active: true,
          tradeOffIfKept: "Fixed 8h overnight duty across biological night.",
        },
      ],
      postShiftSafetyWarning: POST_SHIFT_DRIVING_WARNING,
      honestTradeOffNote:
        "Night 1 carries unavoidable circadian misalignment (~4.5h). The afternoon nap cushions alertness, not circadian phase.",
    },
    {
      dayIndex: 2,
      label: "Wed",
      date: "2026-10-21",
      dayType: "night_shift",
      dayTypeBadge: "Night 2 (22:00–06:00)",
      plannedSleepStartMin: 8 * 60 + 45,
      plannedSleepEndMin: 15 * 60 + 0,
      targetAnchorStartMin: 8 * 60 + 45,
      targetAnchorEndMin: 15 * 60 + 30,
      usualSleepStartMin: 23 * 60 + 0,
      usualSleepEndMin: 6 * 60 + 45,
      estimatedBodySleepStartMin: 2 * 60 + 0,
      estimatedBodySleepEndMin: 9 * 60 + 30,
      misalignmentHours: 5.0,
      baselineMisalignmentHours: 6.5,
      primaryAction: {
        id: "shift-wed-avoid",
        kind: "avoid_light",
        title: "Shade morning light on commute; sleep 08:45–15:00",
        timeWindow: "06:15 – 08:45",
        startMin: 6 * 60 + 15,
        endMin: 8 * 60 + 45,
        shortReason: "Blocking bright morning sun keeps your body clock from locking onto daytime wakefulness.",
        constraintNote: "Fixed 07:45 school run delays sleep start until 08:45.",
      },
      secondaryMarks: [
        { id: "wed-sleep", kind: "sleep_window", label: "Protected daytime sleep", timeMin: 8 * 60 + 45, note: "Blackout curtains + phone on Do Not Disturb 08:45–15:00 (6h15m)." },
        { id: "wed-caf", kind: "caffeine_cutoff", label: "Last shift coffee 01:30", timeMin: 1 * 60 + 30, note: "Protects Thursday morning daytime recovery sleep." },
      ],
      commitments: [
        {
          id: "wed-commute",
          title: "Morning commute home",
          startMin: 6 * 60,
          endMin: 6 * 60 + 45,
          category: "commute",
          negotiable: false,
          active: true,
          tradeOffIfKept: "High drowsiness window after overnight work.",
        },
        {
          id: "wed-school",
          title: "School drop-off (Fixed)",
          startMin: 7 * 60 + 45,
          endMin: 8 * 60 + 30,
          category: "childcare",
          negotiable: false,
          active: true,
          tradeOffIfKept: "Prevents sleeping immediately at 06:45; pushes sleep to 08:45.",
        },
        {
          id: "wed-pickup",
          title: "School pickup",
          startMin: 15 * 60 + 30,
          endMin: 16 * 60 + 15,
          category: "childcare",
          negotiable: true,
          active: true,
          tradeOffIfKept: "Cuts daytime recovery sleep off at 15:00 (6h 15m total).",
          tradeOffIfMoved: "Partner covering pickup extends protected sleep to 16:15 (7h 30m).",
        },
        {
          id: "wed-shift",
          title: "Night Shift 2 (Hospital Ward)",
          startMin: 22 * 60,
          endMin: 6 * 60,
          category: "work",
          negotiable: false,
          active: true,
          tradeOffIfKept: "Fixed overnight shift.",
        },
      ],
      postShiftSafetyWarning: POST_SHIFT_DRIVING_WARNING,
      honestTradeOffNote:
        "No ideal solution today: fixed 07:45 drop-off and 15:30 pickup squeeze daytime sleep to 6h 15m.",
    },
    {
      dayIndex: 3,
      label: "Thu",
      date: "2026-10-22",
      dayType: "night_shift",
      dayTypeBadge: "Night 3 (22:00–06:00)",
      plannedSleepStartMin: 8 * 60 + 45,
      plannedSleepEndMin: partnerCoversAfternoonPickup ? 16 * 60 + 15 : 15 * 60 + 0,
      targetAnchorStartMin: 8 * 60 + 45,
      targetAnchorEndMin: 16 * 60 + 15,
      usualSleepStartMin: 23 * 60 + 0,
      usualSleepEndMin: 6 * 60 + 45,
      estimatedBodySleepStartMin: 3 * 60 + 0,
      estimatedBodySleepEndMin: 10 * 60 + 30,
      misalignmentHours: partnerCoversAfternoonPickup ? 3.6 : 4.6,
      baselineMisalignmentHours: 6.2,
      primaryAction: {
        id: "shift-thu-sleep",
        kind: "sleep_window",
        title: partnerCoversAfternoonPickup
          ? "Protected sleep extended to 16:15 (partner pickup)"
          : "Protect 08:45–15:00 sleep window (or hand off 15:30 pickup)",
        timeWindow: partnerCoversAfternoonPickup ? "08:45 – 16:15" : "08:45 – 15:00",
        startMin: 8 * 60 + 45,
        endMin: partnerCoversAfternoonPickup ? 16 * 60 + 15 : 15 * 60 + 0,
        shortReason: partnerCoversAfternoonPickup
          ? "Handing off the 15:30 pickup adds +75 min of recovery sleep before your final night shift."
          : "Three nights of 6h15m sleep builds debt; handing off the 15:30 pickup unlocks a 7.5h sleep block.",
        constraintNote: partnerCoversAfternoonPickup
          ? "Negotiable 15:30 school pickup handed off — sleep window extended by 75 min."
          : "15:30 school pickup is negotiable — toggle below to see the plan adapt.",
      },
      secondaryMarks: [
        { id: "thu-avoid", kind: "avoid_light", label: "Dark glasses on commute", timeMin: 6 * 60 + 15, note: "Avoid bright morning light until blackout bedroom." },
        { id: "thu-caf", kind: "caffeine_cutoff", label: "Early cutoff 00:30", timeMin: 0 * 60 + 30, note: "Stop caffeine earlier on final night shift so Friday's recovery nap works." },
      ],
      commitments: [
        {
          id: "thu-commute",
          title: "Morning commute home",
          startMin: 6 * 60,
          endMin: 6 * 60 + 45,
          category: "commute",
          negotiable: false,
          active: true,
          tradeOffIfKept: "Cumulative fatigue after 2 nights increases commute risk.",
        },
        {
          id: "thu-school",
          title: "School drop-off (Fixed)",
          startMin: 7 * 60 + 45,
          endMin: 8 * 60 + 30,
          category: "childcare",
          negotiable: false,
          active: true,
          tradeOffIfKept: "Fixed family commitment before sleep.",
        },
        {
          id: "thu-pickup",
          title: "Afternoon school pickup (Negotiable)",
          startMin: 15 * 60 + 30,
          endMin: 16 * 60 + 15,
          category: "childcare",
          negotiable: true,
          active: !partnerCoversAfternoonPickup,
          tradeOffIfKept: "Forces 15:00 wake-up (6h 15m sleep opportunity).",
          tradeOffIfMoved: "Partner covers pickup → sleep extends to 16:15 (7h 30m).",
        },
        {
          id: "thu-shift",
          title: "Night Shift 3 (Hospital Ward)",
          startMin: 22 * 60,
          endMin: 6 * 60,
          category: "work",
          negotiable: false,
          active: true,
          tradeOffIfKept: "Final overnight shift of the block.",
        },
      ],
      postShiftSafetyWarning: POST_SHIFT_DRIVING_WARNING,
      honestTradeOffNote: partnerCoversAfternoonPickup
        ? "Moving the negotiable 15:30 pickup gives you 7h 30m of daytime sleep opportunity, though daytime sleep remains lighter than night sleep."
        : "Fixed morning drop-off + afternoon pickup pinches sleep to 6h 15m. See if a partner or family member can cover Thursday's 15:30 pickup.",
    },
    {
      dayIndex: 4,
      label: "Fri",
      date: "2026-10-23",
      dayType: "transition_off",
      dayTypeBadge: "Transition Off-Shift",
      plannedSleepStartMin: 22 * 60 + 30,
      plannedSleepEndMin: 7 * 60 + 0,
      napWindow: {
        startMin: 8 * 60 + 45,
        endMin: 12 * 60 + 15,
        label: "Post-shift recovery sleep (3.5h cap)",
      },
      targetAnchorStartMin: 23 * 60 + 30,
      targetAnchorEndMin: 7 * 60 + 30,
      usualSleepStartMin: 23 * 60 + 0,
      usualSleepEndMin: 6 * 60 + 45,
      estimatedBodySleepStartMin: 2 * 60 + 30,
      estimatedBodySleepEndMin: 10 * 60 + 0,
      misalignmentHours: 3.0,
      baselineMisalignmentHours: 4.8,
      primaryAction: {
        id: "shift-fri-light",
        kind: "light_exposure",
        title: "Cap morning recovery sleep at 12:15, then get outdoor light",
        timeWindow: "12:30 – 13:30",
        startMin: 12 * 60 + 30,
        endMin: 13 * 60 + 30,
        shortReason: "A 3.5h morning sleep clears acute fatigue while leaving enough sleep drive to sleep tonight at 22:30.",
        constraintNote: "Waking at 12:15 leaves your afternoon free for family pickup.",
      },
      secondaryMarks: [
        { id: "fri-nap", kind: "nap", label: "Morning recovery sleep 08:45–12:15", timeMin: 8 * 60 + 45, note: "3.5h recovery sleep after final night shift." },
        { id: "fri-caf", kind: "caffeine_cutoff", label: "Last coffee 14:30", timeMin: 14 * 60 + 30, note: "Protects your 22:30 return-to-night bedtime." },
      ],
      commitments: [
        {
          id: "fri-commute",
          title: "Morning commute home (High fatigue)",
          startMin: 6 * 60,
          endMin: 6 * 60 + 45,
          category: "commute",
          negotiable: false,
          active: true,
          tradeOffIfKept: "Highest cumulative drowsiness after 3 consecutive night shifts.",
        },
        {
          id: "fri-school",
          title: "School drop-off (Fixed)",
          startMin: 7 * 60 + 45,
          endMin: 8 * 60 + 30,
          category: "childcare",
          negotiable: false,
          active: true,
          tradeOffIfKept: "Delays recovery sleep until 08:45.",
        },
        {
          id: "fri-pickup",
          title: "School pickup",
          startMin: 15 * 60 + 30,
          endMin: 16 * 60 + 15,
          category: "childcare",
          negotiable: true,
          active: true,
          tradeOffIfKept: "Aligns naturally with waking at 12:15.",
        },
      ],
      postShiftSafetyWarning: POST_SHIFT_DRIVING_WARNING,
      honestTradeOffNote:
        "Transition day is a balancing act: sleeping all day Friday ruins Friday night, so a 3.5h morning anchor + midday daylight bridges you back.",
    },
    {
      dayIndex: 5,
      label: "Sat",
      date: "2026-10-24",
      dayType: "day_off",
      dayTypeBadge: "Recovery Day Off",
      plannedSleepStartMin: 23 * 60 + 30,
      plannedSleepEndMin: 8 * 60 + 0,
      targetAnchorStartMin: 0 * 60 + 0,
      targetAnchorEndMin: 8 * 60 + 0,
      usualSleepStartMin: 23 * 60 + 0,
      usualSleepEndMin: 6 * 60 + 45,
      estimatedBodySleepStartMin: 1 * 60 + 0,
      estimatedBodySleepEndMin: 8 * 60 + 30,
      misalignmentHours: 1.5,
      baselineMisalignmentHours: 3.2,
      primaryAction: {
        id: "shift-sat-light",
        kind: "light_exposure",
        title: "Morning family walk in outdoor daylight at 08:30",
        timeWindow: "08:30 – 09:15",
        startMin: 8 * 60 + 30,
        endMin: 9 * 60 + 15,
        shortReason: "Advances your partially-delayed clock back toward your daytime family schedule.",
        constraintNote: "Keep 00:00–08:00 anchor sleep overlap on days off.",
      },
      secondaryMarks: [
        { id: "sat-caf", kind: "caffeine_cutoff", label: "Last coffee 15:30", timeMin: 15 * 60 + 30, note: "8h before 23:30 bedtime." },
      ],
      commitments: [
        {
          id: "sat-family",
          title: "Kids' Saturday football",
          startMin: 10 * 60,
          endMin: 11 * 60 + 30,
          category: "childcare",
          negotiable: false,
          active: true,
          tradeOffIfKept: "Doubles as outdoor morning daylight exposure.",
        },
      ],
      honestTradeOffNote:
        "Keeping anchor sleep (00:00–08:00) on weekends stabilizes your rhythm without forcing a 05:30 wake-up.",
    },
    {
      dayIndex: 6,
      label: "Sun",
      date: "2026-10-25",
      dayType: "day_off",
      dayTypeBadge: "Day Off (Clocks Go Back)",
      plannedSleepStartMin: 23 * 60 + 0,
      plannedSleepEndMin: 7 * 60 + 0,
      targetAnchorStartMin: 23 * 60 + 0,
      targetAnchorEndMin: 7 * 60 + 0,
      usualSleepStartMin: 23 * 60 + 0,
      usualSleepEndMin: 6 * 60 + 45,
      estimatedBodySleepStartMin: 23 * 60 + 45,
      estimatedBodySleepEndMin: 7 * 60 + 30,
      misalignmentHours: 0.8,
      baselineMisalignmentHours: 2.2,
      primaryAction: {
        id: "shift-sun-anchor",
        kind: "sleep_window",
        title: "Use the 25 Oct clock-back hour for recovery sleep",
        timeWindow: "23:00 – 07:00",
        startMin: 23 * 60,
        endMin: 7 * 60,
        shortReason: "UK clocks fall back 1h to GMT today—an extra hour of night sleep ahead of Monday's day shift.",
        constraintNote: "Ready for Monday 08:30 day shift.",
      },
      secondaryMarks: [
        { id: "sun-light", kind: "light_exposure", label: "Morning daylight 08:00", timeMin: 8 * 60, note: "Locks in daytime wake time." },
      ],
      commitments: [],
      honestTradeOffNote:
        "Body clock is back within ~0.8h of your daytime target as UK clocks switch from BST (UTC+1) to GMT (UTC+0).",
    },
  ];

  return baseDays.map((d) => {
    const isSkipped = skippedDayIndices.has(d.dayIndex);
    const hasAlcohol = alcoholDayIndices.has(d.dayIndex);
    const uncertaintyHalfWidthMin = 50 + (isSkipped ? 15 : 0) + (hasAlcohol ? 20 : 0);
    const effectiveMisalignment = isSkipped
      ? Math.min(d.baselineMisalignmentHours, Math.round((d.misalignmentHours + 0.8) * 10) / 10)
      : d.misalignmentHours;
    const halfBand = uncertaintyHalfWidthMin / 60;
    return {
      ...d,
      misalignmentHours: effectiveMisalignment,
      misalignmentLowHours: Math.max(0, Math.round((effectiveMisalignment - halfBand) * 10) / 10),
      misalignmentHighHours: Math.round((effectiveMisalignment + halfBand) * 10) / 10,
      uncertaintyHalfWidthMin,
    };
  });
}
