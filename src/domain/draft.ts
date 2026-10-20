// The draft, and what the planner did to it.
//
// The live path hands Otto a solver draft: "a feasible skeleton that already
// passed the scorer". But a draft in the prompt is a suggestion, and a
// suggestion an LLM can ignore. The plan that came back could be written from
// scratch — different times, a different shift, none of the solver's work
// kept — and nobody would ever know, because the gate judges the result and
// the result is the only thing anyone looks at.
//
// So the draft becomes the *default*: the planner submits what it wants to
// change, and anything it does not mention keeps the solver's value. Moving a
// time is then an explicit act rather than an omission.
//
// `draftDrift` is the other half: how far the submitted plan moved from the
// draft. It is not a judgement — a planner that moves the light on purpose
// has reasons — but it is the number that says whether the solver's work
// survived, and it belongs in the transcript where it can be seen.

import { z } from "zod";
import type { DayPlan, Intervention, InterventionKind } from "./types";

/** The kinds a plan can carry — the same list the tool has always accepted. */
export const INTERVENTION_KINDS = [
  "light_exposure",
  "avoid_light",
  "sleep_window",
  "caffeine_cutoff",
  "melatonin",
  "exercise",
  "meal_timing",
  "nap",
] as const;

/**
 * What the planner submits. Every field is optional on purpose: the draft is
 * the default, so a submission that says nothing means "keep the solver's
 * plan" and a submission that names a time means "I moved this one".
 */
export const planSubmissionSchema = z.object({
  shiftMin: z.number().optional(),
  targetBedtimeMin: z.number().optional(),
  targetWakeMin: z.number().optional(),
  interventions: z
    .array(
      z.object({
        kind: z.enum(INTERVENTION_KINDS),
        startMin: z.number().optional(),
        endMin: z.number().optional(),
        note: z.string().optional(),
        citationId: z.string().optional(),
      }),
    )
    .optional(),
});

/** What the planner submits. Every field is optional: what is not submitted
 *  keeps the draft's value. */
export interface PlanSubmission {
  shiftMin?: number;
  targetBedtimeMin?: number;
  targetWakeMin?: number;
  interventions?: (Omit<Intervention, "startMin" | "endMin"> & {
    startMin?: number;
    endMin?: number;
  })[];
}

/**
 * The plan the planner's submission describes: the draft, with the
 * submission's changes applied.
 *
 * The times are per intervention *kind*: a submitted intervention without
 * times inherits the draft's block for that kind. A plan that changes the
 * shift without moving the cues is a plan the gate will question — which is
 * the right place for that question.
 */
export function mergeWithDraft(draft: DayPlan, submission: PlanSubmission): DayPlan {
  const shiftMin = submission.shiftMin ?? draft.shiftMin;
  const targetBedtimeMin = submission.targetBedtimeMin ?? draft.targetBedtimeMin;
  const targetWakeMin = submission.targetWakeMin ?? draft.targetWakeMin;

  const draftByKind = new Map<string, Intervention>();
  for (const iv of draft.interventions) {
    if (!draftByKind.has(iv.kind)) draftByKind.set(iv.kind, iv);
  }

  const interventions: Intervention[] = (submission.interventions ?? draft.interventions).map(
    (iv) => {
      const fallback = draftByKind.get(iv.kind);
      const startMin = iv.startMin ?? fallback?.startMin ?? 0;
      const endMin = iv.endMin ?? fallback?.endMin;
      return {
        kind: iv.kind,
        startMin,
        ...(endMin === undefined ? {} : { endMin }),
        note: iv.note ?? fallback?.note ?? "",
        ...(iv.citationId ?? fallback?.citationId
          ? { citationId: (iv.citationId ?? fallback?.citationId) as string }
          : {}),
      } as Intervention;
    },
  );

  return { dayIndex: draft.dayIndex, label: draft.label, shiftMin, targetBedtimeMin, targetWakeMin, interventions };
}

export interface DraftDrift {
  /** Whether the planner claimed a different shift than the draft. */
  shiftChanged: boolean;
  /** The shift difference, in minutes. */
  shiftDeltaMin: number;
  /** The total movement of the cues, in minutes. */
  minutesMoved: number;
  /** The kinds the planner added or dropped. */
  kindsChanged: InterventionKind[];
  /** How many of the draft's cues the planner kept exactly. */
  cuesKept: number;
}

/**
 * How far the submitted plan moved from the draft. A number, not a verdict:
 * the gate judges the plan, this says what happened to the solver's work.
 */
export function draftDrift(draft: DayPlan, plan: DayPlan): DraftDrift {
  const shiftDeltaMin = plan.shiftMin - draft.shiftMin;

  const draftByKind = new Map<string, Intervention>();
  for (const iv of draft.interventions) {
    if (!draftByKind.has(iv.kind)) draftByKind.set(iv.kind, iv);
  }
  const planByKind = new Map<string, Intervention>();
  for (const iv of plan.interventions) {
    if (!planByKind.has(iv.kind)) planByKind.set(iv.kind, iv);
  }

  let minutesMoved = 0;
  let cuesKept = 0;
  for (const iv of plan.interventions) {
    const before = draftByKind.get(iv.kind);
    if (!before) continue;
    const moved = Math.abs(iv.startMin - before.startMin);
    minutesMoved += moved;
    if (moved === 0) cuesKept += 1;
  }

  const kindsChanged: InterventionKind[] = [];
  for (const kind of draftByKind.keys()) {
    if (!planByKind.has(kind)) kindsChanged.push(kind as InterventionKind);
  }
  for (const kind of planByKind.keys()) {
    if (!draftByKind.has(kind)) kindsChanged.push(kind as InterventionKind);
  }

  return {
    shiftChanged: shiftDeltaMin !== 0,
    shiftDeltaMin,
    minutesMoved,
    kindsChanged,
    cuesKept,
  };
}

/** One line, for the transcript. */
export function describeDrift(drift: DraftDrift): string {
  if (!drift.shiftChanged && drift.minutesMoved === 0 && drift.kindsChanged.length === 0) {
    return "kept the solver's draft";
  }
  const parts: string[] = [];
  if (drift.shiftChanged) {
    parts.push(`shift ${drift.shiftDeltaMin > 0 ? "+" : ""}${drift.shiftDeltaMin}min`);
  }
  if (drift.minutesMoved > 0) parts.push(`cues moved ${drift.minutesMoved}min`);
  if (drift.kindsChanged.length) parts.push(`${drift.kindsChanged.join(", ")} changed`);
  return parts.join(" · ");
}
