"use client";

import Link from "next/link";
import { Card } from "@/components/ui";
import { BottomNav } from "@/components/BottomNav";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CrewEvent } from "@/domain/types";
import { meetingReadiness } from "@/domain/readiness";
import { fmtMin } from "@/domain/circadian";
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
  const riskOf = (t: (typeof TEAM_TRAVELLERS)[number]) => {
    const r = runs.get(t.id);
    if (!r) return false;
    return meetingReadiness(r.trip ?? teamTrip(t), calendarWithMoves(r), [...r.locked.values()]).some(
      (x) => x.status === "risk",
    );
  };
  const atRisk = TEAM_TRAVELLERS.filter(riskOf).length;
  // Once the run is over, at-risk crews lead. While streaming the order stays put
  // so tiles don't jump under the cursor.
  const ordered = streaming
    ? TEAM_TRAVELLERS
    : [...TEAM_TRAVELLERS].sort((a, b) => Number(riskOf(b)) - Number(riskOf(a)));

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 pb-20 font-mono2 text-paper md:pb-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-mist hover:text-paper">
            ← run a shift
          </Link>
          <h1 className="mt-2 font-mono2 text-2xl font-bold tracking-[0.22em]">TEAM · 12 CREWS</h1>
          <p className="mt-1 text-xs text-mist">
            {streaming
              ? runs.size === 0
                ? "Connecting the twelve crews…"
                : "Twelve crews running in parallel, one stream."
              : "Run finished. At-risk crews are listed first."}
          </p>
        </div>
        <div className="text-right text-xs text-mist">
          <div>
            <span className="font-bold text-pass">{done}</span> of {TEAM_TRAVELLERS.length} crews done ·{" "}
            <span className="font-bold text-fail">{atRisk}</span> board meetings at risk
          </div>
          <button
            onClick={restart}
            disabled={streaming}
            className="mt-2 rounded-lg border border-line bg-ink-2 px-3 py-1.5 text-xs text-paper hover:border-mist disabled:text-dim"
          >
            {streaming ? "running…" : "run the team again"}
          </button>
          <div className="mt-1 text-xs text-dim">
            ~£25/traveller/mo →{" "}
            <span className="font-bold text-mist">
              £{TEAM_TRAVELLERS.length * 25}/mo for this team
            </span>{" "}
            <span className="text-dim">(hypothesis)</span>
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.map((t) => {
          const r = runs.get(t.id) ?? initialRunState();
          const trip = r.trip ?? teamTrip(t);
          const readiness = meetingReadiness(trip, calendarWithMoves(r), [...r.locked.values()]);
          const risk = readiness.find((x) => x.status === "risk");
          const badge =
            r.phase === "idle"
              ? { text: "WAITING", cls: "bg-line text-mist" }
              : risk
                ? { text: "AT RISK", cls: "bg-fail/10 text-fail" }
                : readiness.length
                  ? { text: "READY", cls: "bg-pass/10 text-pass" }
                  : { text: r.phase === "done" ? "DONE" : "PLANNING", cls: "bg-line text-mist" };
          const pct = Math.round(r.sunProgress * 100);
          return (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold">{t.name}</div>
                  <div className="mt-0.5 text-xs text-mist">
                    {trip.origin.code} <span className="text-sun-dest">→</span> {trip.destination.code} ·{" "}
                    {trip.destination.name}
                  </div>
                </div>
                <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${badge.cls}`}>{badge.text}</span>
              </div>

              <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-line">
                <div className="h-full bg-pass transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-mist">
                <span>
                  {r.locked.size}/{trip.days.length} days locked
                </span>
                <span>
                  {r.attempts} attempts · {r.rejections} rejected
                </span>
              </div>

              {readiness.map((x) => (
                <div
                  key={x.eventId}
                  title={x.text}
                  className={`mt-2 flex items-center gap-1.5 text-xs ${x.status === "risk" ? "text-fail" : "text-mist"}`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${x.status === "risk" ? "bg-fail" : "bg-pass"}`} />
                  <span className="min-w-0 flex-1 truncate">{x.title}</span>
                  <span className="shrink-0 font-mono2 font-bold">
                    {x.bodyWithoutPlanMin !== x.bodyMin
                      ? `${fmtMin(x.bodyWithoutPlanMin)} → ${fmtMin(x.bodyMin)}`
                      : fmtMin(x.bodyMin)}
                  </span>
                </div>
              ))}
            </Card>
          );
        })}
      </div>
      <BottomNav />
    </main>
  );
}
