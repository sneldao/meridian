"use client";

import { useState } from "react";
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

export default function DevInteractiveDay() {
  const [dayIndex, setDayIndex] = useState(demo.event.dayIndex);
  const [version, setVersion] = useState(store.read().version);
  const [mode, setMode] = useState<"settle" | "momentum" | "both">("settle");

  const ctx = {
    trip: demo.trip,
    calendar: demo.calendar,
    adherence: ADHERENCE_PROFILE,
    baseline: { avgBedtimeMin: demo.baseline.avgBedtimeMin, avgWakeMin: demo.baseline.avgWakeMin },
  };
  const planDays = demo.trip.days.filter((d) => demo.plans.some((p) => p.dayIndex === d.dayIndex));

  return (
    <main className="flex min-h-screen flex-col items-center gap-4 p-4">
      <p className="font-mono2 text-xs text-clay-2">
        interactive day — example scenario (miles), inspection + proposal only
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {planDays.map((d) => (
          <button
            key={d.dayIndex}
            type="button"
            aria-pressed={dayIndex === d.dayIndex}
            className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-clay data-[pressed]:font-bold"
            onClick={() => setDayIndex(d.dayIndex)}
          >
            {d.label}
          </button>
        ))}
        <span className="font-mono2 text-xs text-clay-2" aria-live="polite">
          store {version}
        </span>
        <label className="flex items-center gap-1 text-xs text-clay-2">
          <input type="checkbox" onChange={(e) => { failNextSave = e.target.checked; }} />
          Fail next save
        </label>
        <button
          type="button"
          className="rounded-lg border border-line px-3 py-2 text-xs text-clay-2"
          onClick={() => { store.simulateExternalEdit(); setVersion(store.read().version); }}
        >
          Simulate an edit elsewhere
        </button>
        <button
          type="button"
          className="rounded-lg border border-line px-3 py-2 text-xs text-clay-2"
          onClick={() => setVersion(store.read().version)}
        >
          Read store version
        </button>
      </div>
      <div role="group" aria-label="Motion mode" className="flex gap-1 rounded-full border border-line p-1">
        {([["settle", "Current"], ["momentum", "Momentum"], ["both", "Side by side"]] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            aria-pressed={mode === v}
            className="rounded-full px-3 py-1 text-xs text-clay-2 aria-pressed:bg-line aria-pressed:text-clay"
            onClick={() => setMode(v)}
          >
            {label}
          </button>
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
