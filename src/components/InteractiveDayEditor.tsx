"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { buildDayScene } from "@/domain/day-scene";
import type { DayPlan, WearableBaseline } from "@/domain/types";
import { usePlanEdit, type PlanEditCtxBase } from "@/lib/use-plan-edit";
import type { PlanStore } from "@/lib/plan-store";
import { InteractiveDay } from "@/components/InteractiveDay";

/* The interactive day with its edit session wired (milestone 4): owns the
 * usePlanEdit hook, rebuilds the day scene whenever the stored plans change
 * (an apply or an undo lands → the lanes and crew reads recompute), and
 * hands InteractiveDay the edit API. Pure exploration when `store` is
 * absent. */

export interface InteractiveDayEditorProps {
  /** Everything evaluatePlan needs except the plans — those live in the store. */
  ctxBase: PlanEditCtxBase & { trip: PlanEditCtxBase["trip"] };
  /** Baseline for scene building (performanceMoment). */
  baseline?: WearableBaseline;
  dayIndex: number;
  requiredMin: number;
  direction?: "east" | "west";
  store: PlanStore;
  /** Fires after a stored change lands (apply or undo) — the page re-points
   *  every surface that reads the plan. */
  onPlansChanged?: (plans: DayPlan[]) => void;
  /** Moment lives on another day — the jump affordance DayScene carried. */
  onJumpToMomentDay?: () => void;
  preview?: boolean;
  example?: boolean;
  motionMode?: "settle" | "momentum";
  children?: ReactNode;
}

export function InteractiveDayEditor({
  ctxBase,
  baseline,
  dayIndex,
  requiredMin,
  direction,
  store,
  onPlansChanged,
  onJumpToMomentDay,
  preview,
  example,
  motionMode,
  children,
}: InteractiveDayEditorProps) {
  const edit = usePlanEdit({ ctxBase, store });
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (edit.version !== reported.current) {
      const first = reported.current === null;
      reported.current = edit.version;
      if (!first) onPlansChanged?.(edit.plans);
    }
  }, [edit.version, edit.plans, onPlansChanged]);
  const scene = useMemo(
    () =>
      buildDayScene({
        trip: ctxBase.trip,
        dayIndex,
        plans: edit.plans,
        calendar: ctxBase.calendar,
        baseline,
      }),
    [ctxBase.trip, ctxBase.calendar, dayIndex, edit.plans, baseline],
  );
  if (!scene) return null;
  return (
    <InteractiveDay
      scene={scene}
      requiredMin={requiredMin}
      direction={direction}
      edit={edit}
      onJumpToMomentDay={onJumpToMomentDay}
      preview={preview}
      example={example}
      motionMode={motionMode}
    >
      {children}
    </InteractiveDay>
  );
}
