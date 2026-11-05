"use client";

import { notFound } from "next/navigation";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { InteractiveDayEditor } from "@/components/InteractiveDayEditor";
import { buildDemoScenario } from "@/domain/demo-scenarios";
import { ADHERENCE_PROFILE } from "@/domain/fixtures";
import { memoryPlanStore } from "@/lib/plan-store";

/* Dev workbench for the round-31 interactive day — exploration plus the
 * milestone-4 proposal flow over the example scenario (miles, LHR → HND),
 * solved by the real solver. The plan lives in an in-memory store; nothing
 * here touches the real plan. Not linked from the app. */

const demo = buildDemoScenario("miles", "2026-11-04");

// Dev-panel flag: read at write time by the store's failNextWrite hook.
let failNextSave = false;
const makeStore = () => memoryPlanStore(demo.plans, {
  failNextWrite: () => {
    const f = failNextSave;
    failNextSave = false;
    return f;
  },
});
const store = makeStore();
const momentumStore = makeStore();

function SegButton({
  selected, onClick, children, thumbId, reduce,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  thumbId: string;
  reduce: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className="relative rounded-md px-4 py-2 text-sm font-semibold transition-transform duration-150 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-text)]"
    >
      {selected && (
        <motion.span
          layoutId={thumbId}
          className="absolute inset-0 rounded-md bg-[var(--m-text)]"
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 24 }}
        />
      )}
      <span className={`relative z-10 transition-colors duration-150 ${selected ? "text-[var(--m-bg)]" : "text-[var(--m-text)]"}`}>
        {children}
      </span>
    </button>
  );
}

export default function DevInteractiveDay() {
  if (process.env.NODE_ENV === "production") notFound(); // internal workbench — never public
  const [dayIndex, setDayIndex] = useState(demo.event.dayIndex);
  const [version, setVersion] = useState(store.read().version);
  const [mode, setMode] = useState<"settle" | "momentum" | "both">("settle");
  const dayThumb = useId();
  const modeThumb = useId();
  const reduce = useReducedMotion() ?? false;

  const ctx = {
    trip: demo.trip,
    calendar: demo.calendar,
    adherence: ADHERENCE_PROFILE,
    baseline: { avgBedtimeMin: demo.baseline.avgBedtimeMin, avgWakeMin: demo.baseline.avgWakeMin },
  };
  const planDays = demo.trip.days.filter((d) => demo.plans.some((p) => p.dayIndex === d.dayIndex));

  return (
    <main className="flex min-h-screen flex-col items-center gap-4 p-4">
      <p className="max-w-xl text-center text-sm text-clay-2">
        Dev workbench — example trip (Miles, LHR → HND).
        Dragging and proposing are free; Apply writes to an in-memory plan only.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="text-sm text-clay-2">Day</span>
        <div className="flex gap-0.5 rounded-md border border-[var(--m-border-2)] bg-[var(--m-card)] p-1 shadow-sm">
          {planDays.map((d) => (
            <SegButton
              key={d.dayIndex}
              selected={dayIndex === d.dayIndex}
              thumbId={dayThumb}
              reduce={reduce}
              onClick={() => setDayIndex(d.dayIndex)}
            >
              {d.label}
            </SegButton>
          ))}
        </div>
      </div>
      <details className="w-full max-w-[680px] rounded-lg border border-dashed border-[var(--m-border-2)] px-3 py-2 text-xs text-[var(--m-muted)]">
        <summary className="cursor-pointer font-mono2 uppercase tracking-wide">
          Dev controls · store {version}
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1">
            <input type="checkbox" onChange={(e) => { failNextSave = e.target.checked; }} />
            Fail next save
          </label>
          <button
            type="button"
            className="rounded-md border border-[var(--m-border-2)] px-3.5 py-1.5 font-semibold transition-transform duration-150 hover:-translate-y-0.5"
            title="Perturbs the stored plan as if another tab edited it — the next Apply should refuse as stale"
            onClick={() => { store.simulateExternalEdit(); setVersion(store.read().version); }}
          >
            Simulate an external edit
          </button>
        </div>
      </details>
      <div role="group" aria-label="Motion mode" className="flex gap-0.5 rounded-md border border-[var(--m-border-2)] bg-[var(--m-card)] p-1 shadow-sm">
        {([["settle", "Current"], ["momentum", "Momentum"], ["both", "Side by side"]] as const).map(([v, label]) => (
          <SegButton
            key={v}
            selected={mode === v}
            thumbId={modeThumb}
            reduce={reduce}
            onClick={() => setMode(v)}
          >
            {label}
          </SegButton>
        ))}
      </div>
      {mode !== "both" && (
        <div className="w-full max-w-[680px]">
          <InteractiveDayEditor
            key={`${dayIndex}-${mode}`}
            ctxBase={ctx}
            baseline={demo.baseline}
            dayIndex={dayIndex}
            requiredMin={Math.abs(demo.trip.requiredShiftMin)}
            direction={demo.trip.direction}
            store={store}
            onPlansChanged={() => setVersion(store.read().version)}
            example
            motionMode={mode === "momentum" ? "momentum" : "settle"}
          />
        </div>
      )}
      {mode === "both" && (
        <div className="grid w-full max-w-[1400px] grid-cols-1 gap-6 min-[1100px]:grid-cols-2">
          {([["Current", store, "settle"], ["Momentum", momentumStore, "momentum"]] as const).map(([label, st, m]) => (
            <div key={label}>
              <p className="mb-2 text-center font-mono2 text-[10px] uppercase tracking-[0.14em] text-clay-2">{label}</p>
              <InteractiveDayEditor
                key={`${dayIndex}-${label}`}
                ctxBase={ctx}
                baseline={demo.baseline}
                dayIndex={dayIndex}
                requiredMin={Math.abs(demo.trip.requiredShiftMin)}
                direction={demo.trip.direction}
                store={st}
                onPlansChanged={() => setVersion(store.read().version)}
                example
                motionMode={m}
              />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
