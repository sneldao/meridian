"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import type {
  CalendarEvent,
  Citation,
  CrewEvent,
  DayPlan,
  Trip,
  WearableBaseline,
} from "@/domain/types";
import { BriefingCard } from "@/components/BriefingCard";
import { CrewFeed, type LogEntry } from "@/components/CrewFeed";
import { DayStrip } from "@/components/DayStrip";
import { SunTrack } from "@/components/SunTrack";

interface TripData {
  trip: Trip;
  baseline: WearableBaseline;
  calendar: CalendarEvent[];
  provider: string;
}

interface Briefing {
  summary: string;
  score: number;
  citations: Citation[];
  days: DayPlan[];
  ics: string;
}

type Phase = "idle" | "running" | "done";

export default function Home() {
  const [data, setData] = useState<TripData | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [sunProgress, setSunProgress] = useState(0);
  const [lockedDays, setLockedDays] = useState<Map<string, DayPlan>>(new Map());
  const [activeDay, setActiveDay] = useState<string>();
  const activeDayRef = useRef<string | undefined>(undefined);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [citationCount, setCitationCount] = useState(0);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    fetch("/api/trip")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
    return () => esRef.current?.close();
  }, []);

  const push = useCallback((e: LogEntry) => {
    setEntries((prev) => [...prev, e]);
  }, []);

  const handleEvent = useCallback(
    (e: CrewEvent) => {
      switch (e.type) {
        case "run_start":
          setEntries([{ kind: "system", text: "shift started — crew assembling" }]);
          setSunProgress(0);
          setLockedDays(new Map());
          setRejected(new Set());
          setCitationCount(0);
          setBriefing(null);
          break;
        case "agent_start":
          push({ kind: "agent", agent: e.agent, title: e.title });
          break;
        case "agent_token":
          setEntries((prev) => {
            const last = prev[prev.length - 1];
            if (last?.kind === "text" && last.agent === e.agent) {
              return [...prev.slice(0, -1), { ...last, text: last.text + e.text }];
            }
            return [...prev, { kind: "text", agent: e.agent, text: e.text }];
          });
          break;
        case "tool_call":
          push({ kind: "tool", agent: e.agent, text: `→ ${e.tool} ${e.detail}` });
          break;
        case "tool_result":
          if (e.detail) push({ kind: "tool", agent: e.agent, text: `  ${e.detail}` });
          break;
        case "citation":
          push({ kind: "citation", citation: e.citation });
          setCitationCount((c) => c + 1);
          break;
        case "plan_candidate":
          setActiveDay(e.day.label);
          activeDayRef.current = e.day.label;
          break;
        case "eval_result":
          push({ kind: "eval", result: e.result });
          if (!e.result.feasible && activeDayRef.current) {
            setRejected((s) => new Set(s).add(activeDayRef.current!));
          }
          break;
        case "day_locked":
          setLockedDays((m) => new Map(m).set(e.day.label, e.day));
          setSunProgress(e.sunProgress);
          setActiveDay(undefined);
          activeDayRef.current = undefined;
          setRejected((s) => {
            const n = new Set(s);
            n.delete(e.day.label);
            return n;
          });
          push({ kind: "locked", label: e.day.label });
          break;
        case "calendar_move":
          push({
            kind: "move",
            text: `${e.move.title}: ${fmtMin(e.move.from.startMin)} → ${fmtMin(e.move.to.startMin)} — ${e.move.reason}`,
          });
          break;
        case "briefing":
          setBriefing({ summary: e.summary, score: e.score, citations: e.citations, days: e.days, ics: e.ics });
          setBriefingDismissed(false);
          push({ kind: "system", text: "morning handoff ready" });
          break;
        case "error":
          push({ kind: "error", text: e.message });
          break;
        case "done":
          setPhase("done");
          esRef.current?.close();
          break;
      }
    },
    [push],
  );

  const startShift = useCallback(() => {
    if (phase === "running") return;
    esRef.current?.close();
    setPhase("running");
    setEntries([]);
    setBriefing(null);
    const es = new EventSource("/api/crew/run");
    esRef.current = es;
    es.onmessage = (m) => handleEvent(JSON.parse(m.data) as CrewEvent);
    es.onerror = () => {
      push({ kind: "error", text: "stream interrupted" });
      setPhase("done");
      es.close();
    };
  }, [handleEvent, phase, push]);

  const trip = data?.trip;

  return (
    <main className="flex h-screen flex-col p-4">
      {/* header */}
      <header className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold tracking-[0.3em] text-[#e8eaf2]">MERIDIAN</h1>
            <span className="text-[10px] tracking-widest text-[#8b93a7] uppercase">
              agents that fly ahead of you
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {trip && (
            <div className="rounded-lg border border-[#1e2637] bg-[#0c1018] px-3 py-1.5 font-mono2 text-[11px] text-[#8b93a7]">
              {trip.origin.code} <span className="text-[#ffc46b]">→</span> {trip.destination.code} · {Math.abs(trip.requiredShiftMin / 60)}h {trip.direction}
            </div>
          )}
          {data && (
            <div className="rounded-lg border border-[#1e2637] bg-[#0c1018] px-3 py-1.5 font-mono2 text-[11px] text-[#4a5470]">
              {data.provider}
            </div>
          )}
          <button
            onClick={startShift}
            disabled={phase === "running"}
            className={`rounded-lg px-5 py-2 text-xs font-bold transition-colors ${
              phase === "running"
                ? "cursor-not-allowed bg-[#1e2637] text-[#4a5470]"
                : "bg-[#b8e356] text-[#07090f] hover:bg-[#cff27e]"
            }`}
          >
            {phase === "running" ? "shift in progress…" : phase === "done" ? "run it again" : "start the night shift"}
          </button>
        </div>
      </header>

      {/* main grid */}
      <div className="grid min-h-0 flex-1 grid-cols-[1.6fr_1fr] gap-4">
        <div className="relative flex min-h-0 flex-col gap-3">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#1e2637]">
            {trip && (
              <SunTrack
                progress={sunProgress}
                days={trip.days}
                lockedLabels={new Set(lockedDays.keys())}
                activeLabel={activeDay}
                citationCount={citationCount}
                running={phase === "running"}
              />
            )}
            {briefing && !briefingDismissed && (
              <BriefingCard
                summary={briefing.summary}
                score={briefing.score}
                citations={briefing.citations}
                days={briefing.days}
                ics={briefing.ics}
                onClose={() => setBriefingDismissed(true)}
              />
            )}
            {briefing && briefingDismissed && (
              <button
                onClick={() => setBriefingDismissed(false)}
                className="absolute bottom-4 right-4 rounded-lg border border-[#ffc46b66] bg-[#0c1018e6] px-3 py-1.5 text-[10px] font-bold tracking-widest text-[#ffc46b] uppercase"
              >
                show handoff
              </button>
            )}
            {phase === "idle" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-sm text-[#8b93a7]">Your body clock is still in London.</div>
                  <div className="mt-1 text-xs text-[#4a5470]">The crew is waiting for the order.</div>
                </div>
              </div>
            )}
          </div>
          {trip && (
            <DayStrip
              days={trip.days}
              locked={lockedDays}
              activeLabel={activeDay}
              rejectedLabels={rejected}
            />
          )}
        </div>

        <div className="min-h-0 overflow-hidden rounded-2xl border border-[#1e2637] bg-[#0c1018] p-3">
          <CrewFeed entries={entries} />
        </div>
      </div>
    </main>
  );
}
