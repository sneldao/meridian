import type { TasteTier } from "@/domain/taste";

/* The tier badge's copy (agent-native §4b, move 3). One vocabulary for the
 * badge, the card's provenance note and the Scout row's provenance — the
 * words are the same ones the sample labels already carry ("recorded",
 * "imagined", "not a live lookup"), never a synonym a surface made up. */

/** "14:32" — local wall-clock rendering of a resolution stamp. */
export function fmtClockHHMM(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** The badge's visible tag. The `· live lookup unavailable` tail is the
 *  same tail the provenance labels carry — a fall gets named wherever the
 *  badge mounts, never smoothed over. */
export function tasteTierLabel(
  tier: TasteTier,
  resolvedAt?: number,
  liveUnavailable = false,
): string {
  const fell = liveUnavailable ? " · live lookup unavailable" : "";
  switch (tier) {
    case "live":
      return `Live${resolvedAt ? ` · ${fmtClockHHMM(resolvedAt)}` : ""}`;
    case "cached":
      return `Cached live answer${resolvedAt ? ` · ${fmtClockHHMM(resolvedAt)}` : ""}${fell}`;
    case "recorded":
      return `Recorded${fell}`;
    case "imagined":
      return `Imagined${fell}`;
    case "unavailable":
      return `Unavailable${fell}`;
  }
}

/** The badge's one-line explainer — what this rung actually is. */
export function tasteTierExplainer(tier: TasteTier, resolvedAt?: number): string {
  switch (tier) {
    case "live":
      return "Resolved live from Qloo just now.";
    case "cached":
      return `A live answer saved on this device${resolvedAt ? ` at ${fmtClockHHMM(resolvedAt)}` : ""} — it rides while the live lookup can't be reached.`;
    case "recorded":
      return "This answer came from a recorded Qloo capture, not a live lookup — enable QLOO_API_KEY for live answers.";
    case "imagined":
      return "This answer was imagined for the story, not a live lookup — enable QLOO_API_KEY for live answers.";
    case "unavailable":
      return "No rung of the ladder could answer — the crew can retry when a lookup is reachable.";
  }
}

/** The provenance-line label for a cached tier — the card's note and the
 *  Scout row name it identically: a live answer this device kept, stamped
 *  with when it resolved. */
export function cachedAnswerLabel(resolvedAt?: number, liveUnavailable = false): string {
  return `Cached live answer${resolvedAt ? ` · ${fmtClockHHMM(resolvedAt)}` : ""}${liveUnavailable ? " · live lookup unavailable" : ""}`;
}
