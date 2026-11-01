import { evaluatePlan, passes } from "./circadian";
import type {
  AdherenceProfile,
  CalendarEvent,
  Citation,
  DayPlan,
  EvalResult,
  EvalViolation,
  Intervention,
  Trip,
} from "./types";

/* Traveller-proposed edits to the plan (round 31+): the traveller may move
 * a light window, the real gate checks the whole trip, then they apply,
 * cancel or undo. Everything here is pure — the storage seam and the hook
 * live in src/lib. Two laws it keeps:
 *
 *  - The gate is the gate. A proposed time is checked by evaluatePlan over
 *    the WHOLE trip with the same inputs the crew uses; it never "looks
 *    plausible" without passing.
 *  - Nothing mutates. Candidates are new arrays and objects; ctx and the
 *    store's plans are never written through this module. */

export interface PlanEditContext {
  trip: Trip;
  plans: DayPlan[];
  calendar: CalendarEvent[];
  adherence: AdherenceProfile;
  baseline?: { avgBedtimeMin: number; avgWakeMin: number };
  citations?: Citation[];
  /** Interventions the traveller already acted on, or otherwise frozen.
   *  Integration supplies it. */
  isLocked?: (dayIndex: number, interventionIndex: number) => boolean;
  /** First day index still editable (today); null = all days. */
  firstEditableDay?: number | null;
}

export interface LightMove {
  dayIndex: number;
  interventionIndex: number;
  newStartMin: number;
  baseVersion: string;
}

export type Editable =
  | { editable: true; startMin: number; endMin: number; durationMin: number }
  | { editable: false; reason: string };

export type BlockReason = {
  code: EvalViolation["code"] | "OUT_OF_DAY";
  message: string;
  dayIndex: number;
};

export type MoveVerdict =
  | { status: "valid"; candidate: DayPlan[]; result: EvalResult; before: EvalResult }
  | { status: "blocked"; reasons: BlockReason[]; candidate: DayPlan[]; result: EvalResult; before: EvalResult }
  | { status: "stale" };

export interface UndoToken {
  dayIndex: number;
  interventionIndex: number;
  previous: Intervention;
  applied: Intervention;
}

/** A small stable fingerprint of the plan set — order-independent by
 *  dayIndex, so two callers computing it over the same plans agree. */
export function planVersion(plans: DayPlan[]): string {
  const ordered = [...plans].sort((a, b) => a.dayIndex - b.dayIndex);
  const s = JSON.stringify(ordered);
  // FNV-1a 32-bit — tiny, stable, and all a "did anything change" needs.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `v${(h >>> 0).toString(36)}-${s.length.toString(36)}`;
}

export function editableIntervention(
  ctx: PlanEditContext,
  dayIndex: number,
  interventionIndex: number,
): Editable {
  const day = ctx.plans.find((d) => d.dayIndex === dayIndex);
  const iv = day?.interventions[interventionIndex];
  if (!day || !iv) return { editable: false, reason: "That window isn't part of the plan." };
  if (ctx.firstEditableDay != null && dayIndex < ctx.firstEditableDay) {
    return { editable: false, reason: "This day has passed." };
  }
  if (ctx.isLocked?.(dayIndex, interventionIndex)) {
    return { editable: false, reason: "Already done — it stays as it happened." };
  }
  if (iv.kind !== "light_exposure") {
    return { editable: false, reason: "Only light windows can be moved for now." };
  }
  if (iv.endMin === undefined || iv.endMin <= iv.startMin || iv.endMin > 1440 || iv.startMin < 0) {
    return { editable: false, reason: "This window crosses midnight." };
  }
  return {
    editable: true,
    startMin: iv.startMin,
    endMin: iv.endMin,
    durationMin: iv.endMin - iv.startMin,
  };
}

const snap5 = (m: number) => Math.round(m / 5) * 5;

export function checkMove(ctx: PlanEditContext, move: LightMove): MoveVerdict {
  if (move.baseVersion !== planVersion(ctx.plans)) return { status: "stale" };

  const edit = editableIntervention(ctx, move.dayIndex, move.interventionIndex);
  const day = ctx.plans.find((d) => d.dayIndex === move.dayIndex);
  const before = evaluatePlan({
    trip: ctx.trip,
    days: ctx.plans,
    calendar: ctx.calendar,
    adherence: ctx.adherence,
    baseline: ctx.baseline,
    citations: ctx.citations,
  });

  if (!edit.editable) {
    return {
      status: "blocked",
      reasons: [{ code: "OUT_OF_DAY", message: edit.reason, dayIndex: move.dayIndex }],
      candidate: ctx.plans.map((d) => ({ ...d, interventions: [...d.interventions] })),
      result: before,
      before,
    };
  }

  const start = snap5(move.newStartMin);
  const end = start + edit.durationMin;
  const candidate: DayPlan[] = ctx.plans.map((d) =>
    d.dayIndex === move.dayIndex
      ? {
          ...d,
          interventions: d.interventions.map((iv, i) =>
            i === move.interventionIndex ? { ...iv, startMin: start, endMin: end } : { ...iv },
          ),
        }
      : { ...d, interventions: [...d.interventions] },
  );

  const result = evaluatePlan({
    trip: ctx.trip,
    days: candidate,
    calendar: ctx.calendar,
    adherence: ctx.adherence,
    baseline: ctx.baseline,
    citations: ctx.citations,
  });

  const reasons: BlockReason[] = [];
  if (start < 0 || end > 1440) {
    reasons.push({
      code: "OUT_OF_DAY",
      message: `That lands outside ${day!.label} — the window has to stay inside the day.`,
      dayIndex: move.dayIndex,
    });
  }
  // Only NEW violations belong to this move — a plan that already carries a
  // finding on another day shouldn't blame it on this edit.
  const pre = new Set(before.violations.map((v) => `${v.code}:${v.dayIndex ?? ""}`));
  const newViolations = result.violations.filter(
    (v) => !pre.has(`${v.code}:${v.dayIndex ?? ""}`),
  );
  for (const v of newViolations) {
    reasons.push({ code: v.code, message: v.message, dayIndex: v.dayIndex ?? move.dayIndex });
  }
  // A plan at the bar must not drop below it — even when the drop introduces
  // no new violation code (e.g. coverage falling under PASS_SCORE).
  if (passes(before) && !passes(result) && newViolations.length === 0) {
    reasons.push({
      code: "OUT_OF_DAY",
      message: "This would drop the plan below the gate's bar.",
      dayIndex: move.dayIndex,
    });
  }

  if (reasons.length === 0) {
    return { status: "valid", candidate, result, before };
  }
  return { status: "blocked", reasons, candidate, result, before };
}

export function undoMove(
  plans: DayPlan[],
  token: UndoToken,
): { ok: true; plans: DayPlan[] } | { ok: false; reason: string } {
  const day = plans.find((d) => d.dayIndex === token.dayIndex);
  const iv = day?.interventions[token.interventionIndex];
  if (!day || !iv) return { ok: false, reason: "That window isn't part of the plan." };
  if (JSON.stringify(iv) !== JSON.stringify(token.applied)) {
    return { ok: false, reason: "This window changed after that edit — undo isn't safe." };
  }
  return {
    ok: true,
    plans: plans.map((d) =>
      d.dayIndex === token.dayIndex
        ? {
            ...d,
            interventions: d.interventions.map((x, i) =>
              i === token.interventionIndex ? { ...token.previous } : x,
            ),
          }
        : d,
    ),
  };
}
