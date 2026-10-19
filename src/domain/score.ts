import { PASS_SCORE } from "./types";

/** Which band a 0..1 plan score falls in.
 *
 *  A score is only ever compared against `PASS_SCORE` — the same constant the
 *  gate itself uses (types.ts: `feasible && score >= PASS_SCORE`). Reading
 *  history without the band painted on it made every run look equally
 *  healthy: three `anthropic · 0.00` rows were wearing the same green as the
 *  0.95s, and 0.00 is a failed plan, not a neutral one.
 *
 *  `warn` is the half-gate band — close enough to the line that the traveller
 *  should look at it, not close enough to call it adapted. Both bands are
 *  derived from the gate rather than invented, so they cannot drift away
 *  from the thing they are reporting on. */
export type ScoreBand = "pass" | "warn" | "fail";

export function scoreBand(score: number): ScoreBand {
  if (!Number.isFinite(score) || score < PASS_SCORE / 2) return "fail";
  return score < PASS_SCORE ? "warn" : "pass";
}