"use client";

// Lens workbench: the recorded run, played through the shared reducer, into
// every lens side by side. Build and screen-record lenses here with no
// pipeline running. Not linked from the app.

import { useState } from "react";
import { FixtureScrubber } from "@/components/dev/FixtureScrubber";
import { RoutePicker } from "@/components/RoutePicker";
import { ShiftBoard } from "@/components/lenses/ShiftBoard";
import { WorldLens } from "@/components/lenses/WorldLens";
import { useFixturePlayback } from "@/state/playback";
import { calendarAfter, ghostGapDeg } from "@/state/run";

export default function DevLenses() {
  const pb = useFixturePlayback({ autoplay: false });
  const { run } = pb;
  const days = run.trip?.days ?? [];
  const [route, setRoute] = useState({ origin: "LHR", dest: "HND", date: "2026-10-18" });

  return (
    <main className="flex min-h-screen flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <RoutePicker {...route} onChange={setRoute} />
        <span className="font-mono2 text-[12px] text-mist">route picker preview — the fixture below is always {pb.fixture.route}</span>
      </div>
      <FixtureScrubber pb={pb} />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <section className="min-h-[360px] overflow-hidden rounded-2xl border border-line">
          <WorldLens
            trip={run.trip}
            progress={run.sunProgress}
            lockedLabels={new Set(run.locked.keys())}
            activeLabel={run.activeLabel}
            citationCount={run.citations.length}
            running={run.phase === "running"}
          />
        </section>
        <section className="min-h-[360px] overflow-auto rounded-2xl border border-line p-3">
          <ShiftBoard
            days={days}
            drafts={run.drafts}
            verdicts={run.verdicts}
            locked={run.locked}
            activeLabel={run.activeLabel}
            activeAgent={run.activeAgent}
          />
        </section>
      </div>
      <section className="grid grid-cols-1 gap-3 font-mono2 text-[12px] text-mist lg:grid-cols-3">
        <div className="rounded-xl border border-line bg-ink-2 p-3">
          <div className="text-paper">state</div>
          <div>phase {run.phase} · agent {run.activeAgent ?? "—"} · day {run.activeLabel ?? "—"}</div>
          <div>tools {run.toolCalls} · attempts {run.attempts} · rejected {run.rejections}</div>
          <div>sun {(run.sunProgress * 100).toFixed(0)}% · ghost gap {ghostGapDeg(run).toFixed(0)}°</div>
          {run.lastTool && <div>last tool {run.lastTool.agent} → {run.lastTool.tool}</div>}
        </div>
        <div className="rounded-xl border border-line bg-ink-2 p-3">
          <div className="text-paper">calendar (after moves)</div>
          {calendarAfter(run).map((e) => (
            <div key={e.id} className={run.moves.some((m) => m.eventId === e.id) ? "text-sun-home" : ""}>
              d{e.dayIndex} {e.title} {e.movable ? "" : "⚓"}
            </div>
          ))}
        </div>
        <div className="max-h-48 overflow-auto rounded-xl border border-line bg-ink-2 p-3">
          <div className="text-paper">ledger (last 12)</div>
          {run.log.filter((l) => l.event.type !== "agent_token").slice(-12).map((l, i) => (
            <div key={i}>{(l.t / 1000).toFixed(2)}s {l.event.type}</div>
          ))}
        </div>
      </section>
    </main>
  );
}
