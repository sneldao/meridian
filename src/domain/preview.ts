// Preview + honesty contracts (items 11–16, Alex ICP read 2026-10-17).
// A renders behind these; B owns the definitions so both lanes read the same
// state. Kept out of components so the rules can be asserted in tests.

import type { BaselineKind } from "./types";
import type { WakeBand } from "./fixtures";
import { WAKE_BAND_ANCHORS } from "./fixtures";

/** True while the numbers on screen are the sample persona's, not the
 *  traveller's — steps render as preview, never as commitments. Item 11.
 *  Preview is `demo-default` with the wake question still unanswered; a
 *  `wake-band` answer or a `garmin` upload ends it. Unknown kind (nothing
 *  fetched yet) previews too — never render fixture numbers as measured. */
export function isPreview(
  baselineKind: BaselineKind | null | undefined,
  wakeBand: unknown,
): boolean {
  if (baselineKind === "garmin" || baselineKind === "wake-band") return false;
  if (baselineKind === "demo-default") return wakeBand == null;
  return true;
}

/** Biometric cells the surface may fill. On preview every measured cell is
 *  null — absent data reads "—", never a plausible fixture number (item 12).
 *  Sleep window survives: it is the shape of the plan, not a measurement. */
export interface DisplayBiometrics {
  sleep: string | null;
  hrv: string | null;
  restingHr: string | null;
}

const fmt = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export function displayBiometrics(input: {
  baselineKind: BaselineKind | null | undefined;
  wakeBand: unknown;
  baseline?: { avgBedtimeMin: number; avgWakeMin: number; hrvMs: number; restingHr: number } | null;
}): DisplayBiometrics {
  if (isPreview(input.baselineKind, input.wakeBand) || !input.baseline) {
    return { sleep: null, hrv: null, restingHr: null };
  }
  const b = input.baseline;
  return {
    sleep: `${fmt(b.avgBedtimeMin)}–${fmt(b.avgWakeMin)}`,
    hrv: `${b.hrvMs} ms`,
    restingHr: `${b.restingHr} bpm`,
  };
}

/** Decides whether a step mark (Done/Skip tap) should be queued into the
 *  pending-check-ins ledger. On preview the tap moves the UI but is held in
 *  an in-memory set only — it must never become a `CheckIn`, because the
 *  planner folds marks into the compliance floor and graph memory. A tap on
 *  a number the app made up would teach the scorer a fabricated night.
 *
 *  Renderers call this with the same inputs they used for `isPreview`; the
 *  rule is identical by construction so the two gates cannot drift. */
export function tapBecomesCheckIn(
  baselineKind: BaselineKind | null | undefined,
  wakeBand: unknown,
): boolean {
  return !isPreview(baselineKind, wakeBand);
}

/** The one-line acknowledgement when the traveller's wake answer re-plans
 *  the preview (round 4, B1). `resolveBaseline` re-solves instantly with no
 *  refetch, but nothing on the hero says the numbers moved — the answer
 *  lands silently and the traveller never learns it mattered. This is the
 *  contract A renders: a single line naming the re-plan, or null when no
 *  answer is in play. Garmin uploads need no acknowledgement — the numbers
 *  were already theirs, not an answer that changed something. */
export function wakeAck(
  baselineKind: BaselineKind | null | undefined,
  wakeBand: WakeBand | null | undefined,
): string | null {
  if (baselineKind === "garmin") return null;
  // Only the two kinds that can carry an answer acknowledge it. `null` /
  // `undefined` kind means nothing fetched yet — a band alongside it is
  // stale state, not an answer, and must not mint a line.
  if (baselineKind !== "demo-default" && baselineKind !== "wake-band") return null;
  if (!wakeBand || !(wakeBand in WAKE_BAND_ANCHORS)) return null;
  const labels: Record<WakeBand, string> = {
    before6: "before 6",
    "6to8": "6–8",
    after8: "after 8",
  };
  return `Re-planned around your mornings (${labels[wakeBand]}) — the plan below is yours now.`;
}
