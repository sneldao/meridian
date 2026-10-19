import type { Citation, InterventionKind } from "./types";

/**
 * Section 8 — Scientific Honesty: Epistemic & Provenance Tags
 * Visibly distinguish what the user entered, what was measured, what is
 * estimated by the model, what is recommended as an action, and what is unknown.
 */
export type EpistemicTag =
  | "You told us"
  | "Measured"
  | "Estimated"
  | "Recommended"
  | "Unknown";

/**
 * Section 4 — Two distinct nudge channels:
 * - "moves_clock": bright-light timing (seek or avoid), sleep timing
 * - "helps_feel_better": caffeine, hydration, exercise, meal timing
 */
export type NudgeChannel = "moves_clock" | "helps_feel_better";

export interface EvidenceEntry {
  kind: InterventionKind | "hydration";
  channel: NudgeChannel;
  channelLabel: "Moves your clock" | "Helps you feel better";
  mechanismGrade: "Strong" | "Moderate" | "Counters sleepiness" | "Limited" | "Unknown";
  fieldGrade: "Uncertain" | "May disrupt later sleep" | "Limited" | "Unknown";
  /** Playful, plain-language two-part label that never obscures the grade. */
  howItWorks: string;
  inRealTrips: string;
  citationIds: string[];
}

/**
 * Verified canonical literature sources (Section 8).
 * Note: These papers support underlying circadian mechanisms and general light/sleep
 * protocols; they never validate Meridian's own deterministic model.
 */
export const VERIFIED_CITATIONS: Citation[] = [
  {
    id: "eastman-burgess-2009",
    source: "verified-fallback",
    title: "How To Travel the World Without Jet Lag (Eastman & Burgess, 2009)",
    year: 2009,
    venue: "Sleep Medicine Clinics, 4(2), 241–255",
    doi: "10.1016/j.jsmc.2009.02.006",
    url: "https://doi.org/10.1016/j.jsmc.2009.02.006",
  },
  {
    id: "eastman-2005",
    source: "verified-fallback",
    title: "Advancing circadian rhythms before eastward flight: a strategy to prevent or reduce jet lag (Eastman et al., 2005)",
    year: 2005,
    venue: "Sleep, 28(1), 33–44",
    doi: "10.1093/sleep/28.1.33",
    url: "https://doi.org/10.1093/sleep/28.1.33",
  },
  {
    id: "bin-2019",
    source: "verified-fallback",
    title: "What works for jet lag? A systematic review of non-pharmacological interventions (Bin, Postnova & Cistulli, 2019)",
    year: 2019,
    venue: "Sleep Medicine Reviews, 43, 47–59",
    doi: "10.1016/j.smrv.2018.09.005",
    url: "https://doi.org/10.1016/j.smrv.2018.09.005",
  },
  {
    id: "aasm-crswd-2007-2015",
    source: "verified-fallback",
    title: "AASM Practice Parameters & Clinical Practice Guideline for Circadian Rhythm Sleep-Wake Disorders (Morgenthaler et al., 2007; Auger et al., 2015)",
    year: 2015,
    venue: "Sleep (2007 extrinsic jet lag/shift work) & J Clin Sleep Med (2015 update)",
    doi: "10.5664/jcsm.5100",
    url: "https://doi.org/10.5664/jcsm.5100",
  },
];

/**
 * Seed Evidence Table (Section 4).
 * Every nudge's grade comes strictly from this table, never from LLM memory.
 * Anything not in the table defaults to "Limited / Unknown".
 */
export const EVIDENCE_SEED_TABLE: Record<string, EvidenceEntry> = {
  light_exposure: {
    kind: "light_exposure",
    channel: "moves_clock",
    channelLabel: "Moves your clock",
    mechanismGrade: "Strong",
    fieldGrade: "Uncertain",
    howItWorks:
      "Strong mechanism: timed bright light after your body's night trough advances your master clock; before it delays.",
    inRealTrips:
      "Real-world effectiveness uncertain: lab phase shifts are reliable, but field trials vary with weather and schedules.",
    citationIds: ["eastman-burgess-2009", "eastman-2005", "bin-2019"],
  },
  avoid_light: {
    kind: "avoid_light",
    channel: "moves_clock",
    channelLabel: "Moves your clock",
    mechanismGrade: "Strong",
    fieldGrade: "Uncertain",
    howItWorks:
      "Strong mechanism: blocking bright light at the wrong circadian hour stops your clock from being pushed backward.",
    inRealTrips:
      "Real-world effectiveness uncertain: requires consistent dimming or dark glasses when airports and streets are bright.",
    citationIds: ["eastman-burgess-2009", "bin-2019"],
  },
  sleep_window: {
    kind: "sleep_window",
    channel: "moves_clock",
    channelLabel: "Moves your clock",
    mechanismGrade: "Moderate",
    fieldGrade: "Uncertain",
    howItWorks:
      "Moderate mechanism: shifting your sleep/dark window supports the light schedule and protects recovery.",
    inRealTrips:
      "Real-world effectiveness uncertain: falling asleep early or during a cabin flight window is often fragmented.",
    citationIds: ["eastman-2005", "aasm-crswd-2007-2015"],
  },
  nap: {
    kind: "nap",
    channel: "moves_clock",
    channelLabel: "Moves your clock",
    mechanismGrade: "Moderate",
    fieldGrade: "Uncertain",
    howItWorks:
      "Moderate mechanism: a brief 20-minute nap takes the edge off homeostatic sleep pressure without stealing nighttime drive.",
    inRealTrips:
      "Real-world effectiveness uncertain: oversleeping past 30 minutes can blunten tonight's sleep onset.",
    citationIds: ["aasm-crswd-2007-2015"],
  },
  caffeine_cutoff: {
    kind: "caffeine_cutoff",
    channel: "helps_feel_better",
    channelLabel: "Helps you feel better",
    mechanismGrade: "Counters sleepiness",
    fieldGrade: "May disrupt later sleep",
    howItWorks:
      "Counters sleepiness: blocks adenosine to mask fatigue, though it doesn't directly reset your master clock.",
    inRealTrips:
      "Trade-off in real trips: sharpens daytime focus, but caffeine within ~8 hours of bed can fragment later sleep.",
    citationIds: ["bin-2019", "aasm-crswd-2007-2015"],
  },
  exercise: {
    kind: "exercise",
    channel: "helps_feel_better",
    channelLabel: "Helps you feel better",
    mechanismGrade: "Limited",
    fieldGrade: "Limited",
    howItWorks:
      "Limited mechanism for jet lag: outdoor movement mostly helps by getting you into daylight and shaking off stiffness.",
    inRealTrips:
      "Limited evidence in real trips: feels great for mood and alertness, but won't replace timed bright light.",
    citationIds: ["bin-2019"],
  },
  meal_timing: {
    kind: "meal_timing",
    channel: "helps_feel_better",
    channelLabel: "Helps you feel better",
    mechanismGrade: "Limited",
    fieldGrade: "Limited",
    howItWorks:
      "Limited mechanism for jet lag: meals cue peripheral gut clocks, not the central brain pacemaker.",
    inRealTrips:
      "Limited evidence in real trips: eating on local time avoids late-night indigestion, though field jet-lag data is sparse.",
    citationIds: ["bin-2019"],
  },
  hydration: {
    kind: "hydration",
    channel: "helps_feel_better",
    channelLabel: "Helps you feel better",
    mechanismGrade: "Limited",
    fieldGrade: "Limited",
    howItWorks:
      "Limited mechanism for jet lag: dry cabin air dehydrates you, which compounds fatigue and headaches.",
    inRealTrips:
      "Limited evidence for jet lag: water helps you feel better after flying, but has zero effect on body-clock phase.",
    citationIds: ["bin-2019"],
  },
};

const UNKNOWN_EVIDENCE: EvidenceEntry = {
  kind: "meal_timing",
  channel: "helps_feel_better",
  channelLabel: "Helps you feel better",
  mechanismGrade: "Unknown",
  fieldGrade: "Limited",
  howItWorks: "Limited or unknown mechanism evidence in the seed table.",
  inRealTrips: "Limited or unknown field evidence in real-world trips.",
  citationIds: [],
};

/** Look up the verified evidence rubric for any intervention kind. */
export function getEvidenceForKind(kind: InterventionKind | "hydration" | string): EvidenceEntry {
  return EVIDENCE_SEED_TABLE[kind] ?? UNKNOWN_EVIDENCE;
}

/** Resolve citations for an evidence entry. */
export function getCitationsForKind(kind: InterventionKind | "hydration" | string): Citation[] {
  const entry = getEvidenceForKind(kind);
  const byId = new Map(VERIFIED_CITATIONS.map((c) => [c.id, c]));
  return entry.citationIds.map((id) => byId.get(id)).filter((c): c is Citation => Boolean(c));
}

export type MascotTone = "gentle" | "cheeky" | "direct";

export type MascotState = "calm" | "syncing" | "drifting" | "droop" | "serious";

export interface MascotVoiceInput {
  tone: MascotTone;
  state: MascotState;
  misalignmentHours: number;
  baselineMisalignmentHours: number;
  skippedActionTitle?: string;
  isShiftPostNightWarning?: boolean;
}

/**
 * Generates mascot micro-copy (<18 words) respecting the user's chosen tone
 * (gentle, cheeky, direct) and strict safety rules:
 * - Never shame delays, family needs, illness, or fixed work.
 * - Never joke about safety-critical situations (post-shift driving/machinery).
 */
export function getMascotCopy(input: MascotVoiceInput): string {
  const {
    tone,
    state,
    misalignmentHours,
    baselineMisalignmentHours,
    isShiftPostNightWarning,
  } = input;

  // Safety-critical override: zero humour, plain language (Section 2 & 7).
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
      return `No problem skipping tonight. Projection slips toward ${baselineMisalignmentHours.toFixed(1)}h baseline—tap to repair tomorrow.`;
    }
    if (tone === "direct") {
      return `Action skipped. Projected gap widens toward ${baselineMisalignmentHours.toFixed(1)}h baseline. One-tap repair ready.`;
    }
    return `Life happens—no guilt. My moon half drooped toward the ${baselineMisalignmentHours.toFixed(1)}h baseline; tap repair to catch up.`;
  }

  const saved = Math.max(0, baselineMisalignmentHours - misalignmentHours);
  if (tone === "gentle") {
    return saved >= 0.5
      ? `Steadily syncing: ~${misalignmentHours.toFixed(1)}h gap vs ${baselineMisalignmentHours.toFixed(1)}h without pre-shifting.`
      : `About ${misalignmentHours.toFixed(1)}h between your body clock and target night. One step at a time.`;
  }
  if (tone === "direct") {
    return `Estimated gap: ${misalignmentHours.toFixed(1)}h (vs ${baselineMisalignmentHours.toFixed(1)}h no-adjustment baseline).`;
  }
  return saved >= 0.5
    ? `Half-sun, half-moon closing the gap: ~${misalignmentHours.toFixed(1)}h out vs ${baselineMisalignmentHours.toFixed(1)}h doing nothing.`
    : `Still ${misalignmentHours.toFixed(1)}h apart—hit today's light window so my two halves stop arguing.`;
}
