"use client";

import { useMemo, useState } from "react";
import { evaluatePlan } from "@/domain/circadian";
import {
  checkMove,
  editableIntervention,
  planVersion,
  undoMove,
  type BlockReason,
  type Editable,
  type MoveVerdict,
  type PlanEditContext,
  type UndoToken,
} from "@/domain/plan-edit";
import type { DayPlan } from "@/domain/types";
import type { PlanStore } from "./plan-store";

/* The edit-session hook (milestone 4). The component works in SceneWindow
 * ids (`${dayIndex}:${interventionIndex}`, day-scene.ts); this hook owns the
 * version handshake with the store: check → apply writes only through the
 * store's expectedVersion, so a stale proposal can never land. Plans shown
 * are always the last successfully stored set. */

export type PlanEditCtxBase = Omit<PlanEditContext, "plans">;

export type ApplyOutcome =
  | { status: "applied"; token: UndoToken; sync?: "synced" | "no-feed" | "no-calendar" }
  | { status: "blocked"; reasons: BlockReason[] }
  | { status: "stale" }
  | { status: "failed" };

export type UndoOutcome =
  | { status: "undone" }
  | { status: "refused"; reason: string }
  | { status: "stale" }
  | { status: "failed" };

export interface PlanEditApi {
  plans: DayPlan[];
  version: string;
  editable(windowId: string): Editable;
  check(windowId: string, newStartMin: number): MoveVerdict;
  apply(windowId: string, newStartMin: number): ApplyOutcome;
  undo(token: UndoToken): UndoOutcome;
  refresh(): void;
}

const parseWindowId = (windowId: string) => {
  const [dayIndex, interventionIndex] = windowId.split(":").map(Number);
  return { dayIndex, interventionIndex };
};

export function usePlanEdit({
  ctxBase,
  store,
}: {
  ctxBase: PlanEditCtxBase;
  store: PlanStore;
}): PlanEditApi {
  const [{ plans, version }, setState] = useState<{ plans: DayPlan[]; version: string }>(() =>
    store.read(),
  );
  const ctx = useMemo<PlanEditContext>(() => ({ ...ctxBase, plans }), [ctxBase, plans]);

  const api = useMemo<PlanEditApi>(() => {
    const editable = (windowId: string): Editable => {
      const { dayIndex, interventionIndex } = parseWindowId(windowId);
      return editableIntervention(ctx, dayIndex, interventionIndex);
    };
    const check = (windowId: string, newStartMin: number): MoveVerdict => {
      const { dayIndex, interventionIndex } = parseWindowId(windowId);
      return checkMove(ctx, { dayIndex, interventionIndex, newStartMin, baseVersion: version });
    };
    const apply = (windowId: string, newStartMin: number): ApplyOutcome => {
      const { dayIndex, interventionIndex } = parseWindowId(windowId);
      const verdict = checkMove(ctx, { dayIndex, interventionIndex, newStartMin, baseVersion: version });
      if (verdict.status === "stale") return { status: "stale" };
      if (verdict.status === "blocked") return { status: "blocked", reasons: verdict.reasons };
      const day = ctx.plans.find((d) => d.dayIndex === dayIndex);
      const previous = day?.interventions[interventionIndex];
      const applied = verdict.candidate
        .find((d) => d.dayIndex === dayIndex)
        ?.interventions[interventionIndex];
      if (!previous || !applied) return { status: "failed" };
      const res = store.write(verdict.candidate, version, { result: verdict.result });
      if (!res.ok) return { status: res.reason };
      setState({ plans: verdict.candidate, version: res.version });
      return { status: "applied", token: { dayIndex, interventionIndex, previous, applied }, sync: res.sync };
    };
    const undo = (token: UndoToken): UndoOutcome => {
      const res = undoMove(plans, token);
      if (!res.ok) return { status: "refused", reason: res.reason };
      // Re-evaluate the restored plan so stored score/coverage stay honest.
      const result = evaluatePlan({
        trip: ctx.trip,
        days: res.plans,
        calendar: ctx.calendar,
        adherence: ctx.adherence,
        baseline: ctx.baseline,
        citations: ctx.citations,
      });
      const w = store.write(res.plans, version, { result });
      if (!w.ok) return { status: w.reason };
      setState({ plans: res.plans, version: w.version });
      return { status: "undone" };
    };
    const refresh = () => setState(store.read());
    return { plans, version, editable, check, apply, undo, refresh };
  }, [ctx, plans, version, store]);

  return api;
}

export { planVersion };
