// The evidence seed table.
//
// Two questions the product asks about every nudge it puts on screen: does it
// move the body clock, or does it only make the traveller feel better? And
// how well is that backed? The answers live here as a table, not in a prompt
// and not in an LLM's memory — so a nudge the table does not cover is visibly
// "Limited / Unknown" rather than quietly confident.
//
// Every grade is a claim about the *literature*, never about Meridian's own
// model. A paper can support the mechanism ("timed light advances the clock")
// without validating the arithmetic that turns a plan into hours.
//
// The table's citation ids point into the shared catalogue (domain/citations),
// so the papers named here are the same objects the research agent returns and
// the scorer's UNKNOWN_CITATION gate resolves.

import { resolveCitations, CITATION_CATALOGUE } from "./citations";
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
  /** Ids into the shared citation catalogue. */
  citationIds: string[];
}

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
    citationIds: ["eastman-2005", "aasm-guideline-2015"],
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
    citationIds: ["aasm-guideline-2015"],
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
    citationIds: ["bin-2019", "aasm-guideline-2015"],
  },
  melatonin: {
    kind: "melatonin",
    channel: "moves_clock",
    channelLabel: "Moves your clock",
    mechanismGrade: "Strong",
    fieldGrade: "Uncertain",
    howItWorks:
      "Strong mechanism: exogenous melatonin in the hours before bed advances the clock, and the light that follows it consolidates the shift.",
    inRealTrips:
      "Real-world effectiveness uncertain: timing matters more than dose, and the crew advises on timing only — never on medication.",
    citationIds: ["eastman-2005", "aasm-guideline-2015"],
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

/**
 * Resolve the papers behind an intervention.
 *
 * `catalogue` lets the caller pass the run's own citation set: when the
 * research agent found papers for this run, those are what the traveller is
 * shown, with the seed table's ids used only to pick the relevant ones. With
 * no run set, the shared catalogue answers.
 */
export function getCitationsForKind(
  kind: InterventionKind | "hydration" | string,
  catalogue: Citation[] = CITATION_CATALOGUE,
): Citation[] {
  const entry = getEvidenceForKind(kind);
  const byId = new Map(catalogue.map((c) => [c.id, c]));
  const picked = entry.citationIds
    .map((id) => byId.get(id))
    .filter((c): c is Citation => Boolean(c));
  return picked.length ? picked : resolveCitations(entry.citationIds);
}
