// Round 4, B3 — second-trip memory proof. The Traveller tier's retention
// claim ("the crew remembers from your last trip") is asserted in copy
// elsewhere but never surfaced. Without a vertical read, the loop is
// claimed, not closed: the traveller has no way to learn the crew used
// their last trip to inform this one.
//
// The contract: pure `secondTripProof(runs, currentRoute)` reads the run
// history and returns the most recent prior trip on a different route,
// or null when there is none. The proof is structured (route, score,
// shift) so the renderer can compose its own copy without inventing.
//
// "Different route" matters: same-route trips are `priorLocked` carry
// (same run, re-entry), not a separate trip. The proof is for a real
// second trip the traveller took, not for re-opening Today after a
// refresh.

export interface SecondTripProofRoute {
  origin: string;
  destination: string;
}

/** The shape the contract accepts — duck-typed so it composes with the
 *  supabase `listRuns()` rows without depending on the tools module. */
export interface SecondTripRun {
  savedAt: string;
  trip?: { origin?: { code?: string }; destination?: { code?: string }; requiredShiftMin?: number; direction?: "east" | "west" } | null;
  score: number;
}

export interface SecondTripProof {
  /** Origin / destination codes of the prior trip — the route the crew
   *  "remembers". Same shape `SecondTripProofRoute` so callers can match. */
  route: SecondTripProofRoute;
  shiftHours: number;
  direction: "east" | "west";
  score: number;
  savedAt: string;
}

export function secondTripProof(
  runs: SecondTripRun[],
  currentRoute: SecondTripProofRoute,
): SecondTripProof | null {
  // runs arrive newest-first (supabase `order created_at desc`). The first
  // row with a route that differs from the current one is the trip we want;
  // same-route rows are the current trip re-opened (not a prior journey).
  for (const r of runs) {
    const origin = r.trip?.origin?.code;
    const destination = r.trip?.destination?.code;
    const direction = r.trip?.direction;
    const required = r.trip?.requiredShiftMin;
    if (!origin || !destination || !direction || typeof required !== "number") {
      // Corrupt or partial row — skip rather than fabricate. The proof
      // either names a real prior trip or returns null.
      continue;
    }
    if (origin === currentRoute.origin && destination === currentRoute.destination) {
      continue;
    }
    return {
      route: { origin, destination },
      shiftHours: Math.max(1, Math.round(Math.abs(required) / 60)),
      direction,
      score: r.score,
      savedAt: r.savedAt,
    };
  }
  return null;
}

/** The render copy for the proof — short, named, honest. Pure so the proof
 *  contract and the surface copy evolve together. */
export function secondTripCopy(p: SecondTripProof): string {
  const when = new Date(p.savedAt);
  const stamp = Number.isNaN(when.getTime())
    ? "your last trip"
    : `your ${when.toLocaleDateString(undefined, { month: "short", day: "numeric" })} trip`;
  return `The crew remembers ${stamp} (${p.route.origin} → ${p.route.destination}, ${p.shiftHours}h ${p.direction}) — score ${p.score.toFixed(2)}.`;
}
