import type { CheckIn } from "./types";
import type { TravelerNudge } from "./nudges";

/** A user-declared constraint derived from a skipped step. The crew re-plans
 *  around these instead of re-issuing the same cue. */
export interface Constraint {
  nudgeId: string;
  dayIndex: number;
  dayLabel: string;
  reason: "skipped";
  createdAt: number;
}

export function constraintsFromSkips(
  skipped: TravelerNudge[],
): Constraint[] {
  return skipped.map((n) => ({
    nudgeId: n.id,
    dayIndex: n.dayIndex,
    dayLabel: n.dayLabel,
    reason: "skipped",
    createdAt: Date.now(),
  }));
}

export function checkInsFromConstraints(
  constraints: Constraint[],
): CheckIn[] {
  return constraints.map((c) => ({
    id: c.nudgeId,
    dayIndex: c.dayIndex,
    dayLabel: c.dayLabel,
    status: "skipped",
    at: c.createdAt,
  }));
}
