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
                ? "border-[#b8e35644] bg-[#131826]"
                : active
                  ? "border-[#ffc46b66] bg-[#131826]"
                  : rejected
                    ? "border-[#ff7a7a55] bg-[#131826]"
                    : "border-[#1e2637] bg-[#0c1018]"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span className={`text-[12px] font-bold ${plan ? "text-[#b8e356]" : active ? "text-[#ffc46b]" : "text-[#8b93a7]"}`}>
                {d.label}
              </span>
              {plan && (
                <span className="font-mono2 text-[12px] text-[#8b93a7]">{plan.shiftMin}m</span>
              )}
            </div>
            {plan ? (
              <div className="mt-1 font-mono2 text-[12px] text-[#e8eaf2]">
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
              <div className="mt-1 font-mono2 text-[12px] text-[#4a5470]">
                {active ? "planning…" : rejected ? "replanning…" : "queued"}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
