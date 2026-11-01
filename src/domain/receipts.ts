import type { DayPlan, InterventionKind } from "./types";
import { interventionSupports } from "./circadian";
import { stepImpactMin, type NudgeCategory } from "./nudges";

/* Step receipts (round 26) — the feed's answer to "I did the thing, what
 * did it do?" Finch's law says the response must be immediate and visible;
 * the honesty law says it must be computed, never flattered.
 *
 * Two layers, each doing what it is best at:
 *  · the PRC model (`interventionSupports`) is the GATE — it says whether
 *    this specific step, at this specific time, actually supported today's
 *    shift. Inert (dead-zone light) or opposing steps are logged warmly and
 *    credited nothing: zero-guilt, no invented minutes.
 *  · the share (`stepImpactMin`) is the NUMBER — the day's validated shift
 *    apportioned to the step's kind. It already feeds the done copy; the
 *    receipt just wears it better.
 * Kinds the model doesn't quantify (the sleep anchor, caffeine cutoffs,
 * meals) pass the gate by default — their share is the published one. */

/** Intervention kinds the PRC model quantifies — only these are gated. */
const QUANTIFIED_KINDS: ReadonlySet<InterventionKind> = new Set([
  "light_exposure",
  "avoid_light",
  "melatonin",
  "exercise",
]);

export interface StepReceiptInput {
  /** The locked day plan the mark belongs to. */
  plan: DayPlan;
  category: NudgeCategory;
  kind?: InterventionKind;
  /** Minutes since local midnight — identifies the step within the day. */
  startMin?: number;
}

export interface StepReceipt {
  /** Attributed minutes of the day's shift — 0 when nothing is credited. */
  minutes: number;
  /** |declared shift| for the day, so callers can show context. */
  dayShiftMin: number;
  /** The traveller-facing line. */
  text: string;
}

export function stepReceipt({ plan, category, kind, startMin }: StepReceiptInput): StepReceipt {
  const shift = Math.abs(plan.shiftMin);
  if (shift === 0) {
    return { minutes: 0, dayShiftMin: 0, text: "holding the day steady" };
  }

  if (kind && startMin !== undefined && QUANTIFIED_KINDS.has(kind)) {
    const mine = interventionSupports(plan).find(
      (s) => s.kind === kind && s.startMin === startMin,
    );
    if (mine && mine.support === 0) {
      // Present but inert — light in the dead zone. Logged, warmly.
      return { minutes: 0, dayShiftMin: shift, text: "logged — dead-zone light still anchors the routine" };
    }
    if (mine && Math.sign(mine.support) !== Math.sign(plan.shiftMin)) {
      // Pushing against the day — logged, never scolded, never credited.
      return { minutes: 0, dayShiftMin: shift, text: "logged" };
    }
  }

  const n = stepImpactMin(plan, category);
  if (n <= 0) {
    return { minutes: 0, dayShiftMin: shift, text: "helps keep the new schedule steady" };
  }
  return {
    minutes: n,
    dayShiftMin: shift,
    text: `≈ ${n} min of the day's ${shift} min — banked`,
  };
}
