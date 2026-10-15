"use client";

import { fmtMin } from "@/domain/circadian";
import { INTERVENTION_ICONS } from "@/lib/intervention-icons";
import type { DayPlan, DaySpec } from "@/domain/types";

interface Props {
  days: DaySpec[];
  locked: Map<string, DayPlan>;
  activeLabel?: string;
  rejectedLabels: Set<string>;
}

export function DayStrip({ days, locked, activeLabel, rejectedLabels }: Props) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {days.map((d) => {
        const plan = locked.get(d.label);
        const active = d.label === activeLabel;
        const rejected = rejectedLabels.has(d.label);
        return (
          <div
            key={d.dayIndex}
            className={`rounded-lg border px-3 py-2 transition-colors ${
              plan
                ? "border-pass/20 bg-ink-3"
                : active
                  ? "border-progress/33 bg-ink-3"
                  : rejected
                    ? "border-fail/33 bg-ink-3"
                    : "border-line bg-ink-2"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span className={`text-xs font-bold ${plan ? "text-pass" : active ? "text-progress" : "text-mist"}`}>
                {d.label}
              </span>
              {plan && (
                <span className="font-mono2 text-xs text-mist">{plan.shiftMin}m</span>
              )}
            </div>
            {plan ? (
              <div className="mt-1 font-mono2 text-xs text-paper">
                <div>bed {fmtMin(plan.targetBedtimeMin)}</div>
                <div>wake {fmtMin(plan.targetWakeMin)}</div>
                <div className="mt-1 flex gap-1">
                  {plan.interventions.map((iv, j) => {
                    const { icon: Icon, tint } = INTERVENTION_ICONS[iv.kind];
                    return <Icon key={j} size={11} color={tint} strokeWidth={2.2} />;
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-1 font-mono2 text-xs text-dim">
                {active ? "planning…" : rejected ? "replanning…" : "queued"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
