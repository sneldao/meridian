"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CrewEvent } from "@/domain/types";
import { meetingReadiness } from "@/domain/readiness";
import { TEAM_TRAVELLERS, teamTrip } from "@/domain/team";
import { calendarWithMoves, initialRunState, reduceRun, type RunState } from "@/state/run";

// The team view: a travel manager's screen. Twelve travellers run their own
// crews in parallel, all on one stream. Each event is tagged with its traveller
// and folded into that traveller's run state, so every tile is a real run.

interface TeamMessage {
  traveller: string | null;
  event: CrewEvent;
}

export default function TeamPage() {
  const [runs, setRuns] = useState<Map<string, RunState>>(() => new Map());
  const [streaming, setStreaming] = useState(true);
  const esRef = useRef<EventSource | null>(null);

  const open = useCallback((): EventSource => {
    const es = new EventSource("/api/team/run");
    esRef.current = es;
    es.onmessage = (m) => {
      const msg = JSON.parse(m.data) as TeamMessage;
      if (msg.traveller === null) {
        setStreaming(false);
        es.close();
        return;
      }
      const id = msg.traveller;
      setRuns((prev) => {
        const next = new Map(prev);
        const current = prev.get(id) ?? initialRunState();
        next.set(id, reduceRun(current, { kind: "event", event: msg.event }));
        return next;
      });
    };
    es.onerror = () => {
      setStreaming(false);
      es.close();
    };
    return es;
  }, []);

  useEffect(() => {
    const es = open();
    return () => es.close();
  }, [open]);

  const restart = useCallback(() => {
    esRef.current?.close();
    setRuns(new Map());
    setStreaming(true);
    open();
  }, [open]);

  const done = TEAM_TRAVELLERS.filter((t) => runs.get(t.id)?.phase === "done").length;
  const atRisk = TEAM_TRAVELLERS.filter((t) => {
    const r = runs.get(t.id);
    if (!r) return false;
    return meetingReadiness(r.trip ?? teamTrip(t), calendarWithMoves(r), [...r.locked.values()]).some(
      (x) => x.status === "risk",
    );
  }).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 font-mono2 text-[#e8eaf2]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-[10px] tracking-widest text-[#8b93a7] uppercase hover:text-[#e8eaf2]">
            ← run a shift
          </Link>
          <h1 className="mt-2 text-lg font-bold tracking-[0.3em]">TEAM · 12 CREWS</h1>
          <p className="mt-1 text-[11px] text-[#8b93a7]">
            {streaming
              ? "Twelve crews running in parallel, one stream."
              : "Run finished. Each tile is a complete crew run."}
          </p>
        </div>
        <div className="text-right text-[11px] text-[#8b93a7]">
          <div>
            <span className="font-bold text-[#b8e356]">{done}</span> of {TEAM_TRAVELLERS.length} crews done ·{" "}
            <span className="font-bold text-[#ff7a7a]">{atRisk}</span> board meetings at risk
          </div>
          <button
            onClick={restart}
            disabled={streaming}
            className="mt-2 rounded-lg border border-[#1e2637] bg-[#0c1018] px-3 py-1.5 text-[11px] text-[#b8e356] hover:border-[#b8e35666] disabled:text-[#4a5470]"
          >
            {streaming ? "running…" : "run the team again"}
          </button>
          <div className="mt-1 text-[10px] text-[#4a5470]">
            Pricing hypothesis: about £20–30 per traveller per month.
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TEAM_TRAVELLERS.map((t) => {
          const r = runs.get(t.id) ?? initialRunState();
          const trip = r.trip ?? teamTrip(t);
          const readiness = meetingReadiness(trip, calendarWithMoves(r), [...r.locked.values()]);
          const risk = readiness.find((x) => x.status === "risk");
          const badge =
            r.phase === "idle"
              ? { text: "WAITING", cls: "bg-[#1e2637] text-[#8b93a7]" }
              : risk
                ? { text: "AT RISK", cls: "bg-[#ff7a7a22] text-[#ff7a7a]" }
                : readiness.length
                  ? { text: "READY", cls: "bg-[#b8e35622] text-[#b8e356]" }
                  : { text: r.phase === "done" ? "DONE" : "PLANNING", cls: "bg-[#1e2637] text-[#8b93a7]" };
          const pct = Math.round(r.sunProgress * 100);
          return (
            <article key={t.id} className="rounded-xl border border-[#1e2637] bg-[#0c1018] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[12px] font-bold">{t.name}</div>
                  <div className="mt-0.5 text-[10px] text-[#8b93a7]">
                    {trip.origin.code} <span className="text-[#ffc46b]">→</span> {trip.destination.code} ·{" "}
                    {trip.destination.name}
                  </div>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${badge.cls}`}>{badge.text}</span>
              </div>

              <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-[#1e2637]">
                <div className="h-full bg-[#b8e356] transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-[#8b93a7]">
                <span>
                  {r.locked.size}/{trip.days.length} days locked
                </span>
                <span>
                  {r.attempts} attempts · {r.rejections} rejected
                </span>
              </div>

              {readiness.map((x) => (
                <p
                  key={x.eventId}
                  className={`mt-2 text-[10px] leading-relaxed ${x.status === "risk" ? "text-[#ff7a7a]" : "text-[#8b93a7]"}`}
                >
                  {x.text}
                </p>
              ))}
            </article>
          );
        })}
      </div>
    </main>
  );
}
