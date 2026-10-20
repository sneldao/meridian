// The mascot's voice.
//
// A mascot that flatters is a mascot that lies: the numbers move because the
// traveller did something, not because the app is pleased. So the copy is
// generated from the same two numbers the dial shows — how far off the body
// clock is, and how far off it would be with no plan at all — and it never
// says the work was wasted.
//
// Two rules it cannot break:
//   · no humour in a safety-critical moment (post-shift driving);
//   · no shame about a skipped step, a family commitment, illness, or a
//     fixed job. The voice acknowledges the miss and points at the repair.
//
// A third thing it should do, which it did not used to: react to the *answer*.
// A mascot that keys off the traveller's state says the same thing to a lark
// and a night owl, and the answer is the interesting part. The lines below
// are picked by the answer and by the direction of the trip, because "early
// to bed" is good news for one direction and a warning for the other.

export type MascotTone = "gentle" | "cheeky" | "direct";

export type MascotState = "calm" | "syncing" | "drifting" | "droop" | "serious";

export interface MascotVoiceInput {
  tone: MascotTone;
  state: MascotState;
  /** Hours the body clock is off the target, as the dial shows it. */
  misalignmentHours: number;
  /** Hours it would be off with no plan at all. */
  baselineMisalignmentHours: number;
  /** Whether the traveller skipped today's clock-moving action. */
  skippedToday?: boolean;
  /** Whether this is a post-night-shift safety moment. */
  isShiftPostNightWarning?: boolean;
}

/**
 * The mascot's line for a moment. Under 20 words — the same budget the daily
 * action card holds itself to.
 */
export function getMascotCopy(input: MascotVoiceInput): string {
  const {
    tone,
    state,
    misalignmentHours,
    baselineMisalignmentHours,
    isShiftPostNightWarning,
  } = input;

  // Safety-critical override: no humour, plain language, no advice about
  // driving beyond "don't if you're sleepy" and where to get real guidance.
  if (isShiftPostNightWarning || state === "serious") {
    return "Post-night-shift drowsiness peaks on the morning commute. Prioritize safe transport and protected sleep.";
  }

  if (state === "calm" || misalignmentHours <= 1.0) {
    if (tone === "gentle") return "Your halves are nearly in sync. Little or no adjustment needed today.";
    if (tone === "direct") return "Body clock within ~1h of target. Hold your normal rhythm.";
    return "Sun and moon are practically holding hands. Barely any shift needed today.";
  }

  if (state === "droop") {
    if (tone === "gentle") {
      return `No problem skipping tonight. The projection slips toward ${baselineMisalignmentHours.toFixed(1)}h — tap to repair tomorrow.`;
    }
    if (tone === "direct") {
      return `Action skipped. The gap widens toward ${baselineMisalignmentHours.toFixed(1)}h with no plan. One-tap repair ready.`;
    }
    return `Life happens — no guilt. My moon half drooped toward the ${baselineMisalignmentHours.toFixed(1)}h baseline; tap repair to catch up.`;
  }

  // The number the traveller earned: the gap closed by the plan, measured
  // against the same clock that says how big the gap is.
  const saved = Math.max(0, baselineMisalignmentHours - misalignmentHours);
  if (tone === "gentle") {
    return saved >= 0.5
      ? `Steadily syncing: ~${misalignmentHours.toFixed(1)}h gap vs ${baselineMisalignmentHours.toFixed(1)}h without a plan.`
      : `About ${misalignmentHours.toFixed(1)}h between your body clock and target night. One step at a time.`;
  }
  if (tone === "direct") {
    return `Estimated gap: ${misalignmentHours.toFixed(1)}h (vs ${baselineMisalignmentHours.toFixed(1)}h with no plan).`;
  }
  return saved >= 0.5
    ? `Half-sun, half-moon closing the gap: ~${misalignmentHours.toFixed(1)}h out vs ${baselineMisalignmentHours.toFixed(1)}h doing nothing.`
    : `Still ${misalignmentHours.toFixed(1)}h apart — hit today's light window so my two halves stop arguing.`;
}


/** The wake bands the setup offers, and the chronotype each one implies. */
export type SleepBand = "before6" | "6to8" | "after8";

/**
 * The wake band a wake time falls in — the same three answers the wake
 * question offers, so the dial can answer in the same vocabulary.
 */
export function bandForWakeTime(wakeMin: number): SleepBand | null {
  const h = ((wakeMin % 1440) + 1440) % 1440 / 60;
  // The same three answers the wake question offers: before 06:00, 06:00 to
  // 08:00, after 08:00.
  if (h < 6) return "before6";
  if (h < 8) return "6to8";
  return "after8";
}

export interface SleepInsightInput {
  /** Which band the traveller picked, if they have picked one. */
  band?: SleepBand | null;
  /** The direction of the trip: eastward is the hard one. */
  direction?: "east" | "west" | null;
  /** How many hours they said they sleep. */
  sleepHours?: number | null;
}

/**
 * What the mascot says about the answer it just got.
 *
 * Null when there is no answer yet — the mascot does not comment on a
 * question nobody has answered.
 */
export function getSleepInsight(input: SleepInsightInput): string | null {
  const { band, direction, sleepHours } = input;
  if (!band) return null;
  const east = direction !== "west";

  // The sleep they said they get is worth a word of its own: it is the one
  // number in the setup that is not a preference.
  const duration =
    sleepHours && sleepHours > 0
      ? sleepHours < 7
        ? " That is on the short side — the plan protects the deep part of it."
        : sleepHours >= 9
          ? " That much sleep helps more than any light cue."
          : ""
      : "";

  switch (band) {
    case "before6":
      return east
        ? `Early to bed — a classic lark. Eastward is the hard direction for you, so we'll front-load the light.${duration}`
        : `Early to bed — a classic lark. Westward is the gentle direction, and your rhythm already suits it.${duration}`;
    case "6to8":
      return east
        ? `You sleep like most people, and that actually helps for a big eastward shift.${duration}`
        : `You sleep like most people — a westbound trip is the easy direction, so this will hold.${duration}`;
    case "after8":
      return east
        ? `A late riser. Late nights are your friend, but eastward is the hard direction — we'll bank the shift before you fly.${duration}`
        : `A late riser, and westward suits you: staying up later is exactly the direction you're already built for.${duration}`;
  }
}
