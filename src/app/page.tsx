"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import { summarizeCheckIn } from "@/domain/adherence";
import { CITY_TABLE } from "@/domain/fixtures";
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

// Voice pump — module-level because it only touches refs; keeps the agent
// utterances sequential instead of talking over each other.
function pumpVoice(
  queue: { agent: string; text: string }[],
  audioSlot: { current: HTMLAudioElement | null },
) {
  if (audioSlot.current || !queue.length) return;
  const job = queue.shift()!;
  fetch("/api/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job),
  })
    .then(async (r) => {
      if (!r.ok) return pumpVoice(queue, audioSlot);
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      audioSlot.current = a;
      const done = () => {
        audioSlot.current = null;
        URL.revokeObjectURL(url);
        pumpVoice(queue, audioSlot);
      };
      a.onended = done;
      a.onerror = done;
      a.play().catch(done);
    })
    .catch(() => pumpVoice(queue, audioSlot));
}

export default function Home() {
  const [origin, setOrigin] = useState("LHR");
  const [dest, setDest] = useState("HND");
  const [departureDate, setDepartureDate] = useState("2026-10-18");
  const [checkInsParam, setCheckInsParam] = useState("");
  const [startDayParam, setStartDayParam] = useState(0);
  const tripQuery = `?origin=${origin}&dest=${dest}&date=${departureDate}`;
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
  const [hasSavedPlan, setHasSavedPlan] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [providerFallback, setProviderFallback] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const voiceOnRef = useRef(true);
  const utterRef = useRef<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceQueueRef = useRef<{ agent: string; text: string }[]>([]);

  const speak = useCallback((agent: string, text: string) => {
    if (!text.trim() || !voiceOnRef.current) return;
    voiceQueueRef.current.push({ agent, text: text.trim() });
    pumpVoice(voiceQueueRef.current, audioRef);
  }, []);

  const stopVoice = useCallback(() => {
    voiceQueueRef.current = [];
    utterRef.current = {};
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  useEffect(() => {
    fetch("/api/trip" + tripQuery)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [tripQuery]);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setHasSavedPlan(Boolean(localStorage.getItem("meridian:lastPlan")));
        setShowOnboarding(!localStorage.getItem("meridian:onboarded"));
        fetch("/api/memory")
          .then((r) => r.json())
          .then((d) => setRunCount(Array.isArray(d?.runs) ? d.runs.length : 0))
          .catch(() => {});
        if (typeof window !== "undefined") {
          const sp = new URLSearchParams(window.location.search);
          if (sp.get("origin")) setOrigin(sp.get("origin")!);
          if (sp.get("dest")) setDest(sp.get("dest")!);
          if (sp.get("date")) setDepartureDate(sp.get("date")!);
          if (sp.get("checkins")) setCheckInsParam(sp.get("checkins")!);
          const sd = Number(sp.get("startDay"));
          if (!Number.isNaN(sd)) setStartDayParam(sd);
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => {
      clearTimeout(t);
      esRef.current?.close();
    };
  }, []);

  const push = useCallback((e: LogEntry) => {
    setEntries((prev) => [...prev, e]);
  }, []);

  const handleEvent = useCallback(
    (e: CrewEvent) => {
      switch (e.type) {
        case "run_start":
          stopVoice();
          setEntries([{ kind: "system", text: "shift started — crew assembling" }]);
          setSunProgress(0);
          setLockedDays(new Map());
          setRejected(new Set());
          setCitationCount(0);
          setBriefing(null);
          setProviderFallback(false);
          try {
            localStorage.setItem("meridian:lastTrip", JSON.stringify(e.trip));
          } catch {
            /* ignore */
          }
          break;
        case "check_in":
          push({ kind: "system", text: `wearer reported: ${summarizeCheckIn(e.checkIn)}` });
          break;
        case "replan":
          push({ kind: "system", text: `replan — ${e.reason}` });
          break;
        case "agent_start":
          push({ kind: "agent", agent: e.agent, title: e.title });
          break;
        case "agent_token":
          utterRef.current[e.agent] = (utterRef.current[e.agent] ?? "") + e.text;
          setEntries((prev) => {
            const last = prev[prev.length - 1];
            if (last?.kind === "text" && last.agent === e.agent) {
              return [...prev.slice(0, -1), { ...last, text: last.text + e.text }];
            }
            return [...prev, { kind: "text", agent: e.agent, text: e.text }];
          });
          break;
        case "agent_end":
          speak(e.agent, utterRef.current[e.agent] ?? "");
          utterRef.current[e.agent] = "";
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
          speak("evaluator", e.summary);
          setBriefing({ summary: e.summary, score: e.score, citations: e.citations, days: e.days, ics: e.ics });
          setBriefingDismissed(false);
          setHasSavedPlan(true);
          try {
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              new Notification("Meridian handoff ready", { body: e.summary });
            }
          } catch {
            /* ignore */
          }
          try {
            localStorage.setItem(
              "meridian:lastPlan",
              JSON.stringify({ summary: e.summary, score: e.score, citations: e.citations, days: e.days, ics: e.ics }),
            );
            const entry = {
              id: Date.now(),
              savedAt: new Date().toISOString(),
              trip: (() => {
                try { return JSON.parse(localStorage.getItem("meridian:lastTrip") || "null"); } catch { return null; }
              })(),
              score: e.score,
              summary: e.summary,
              days: e.days,
              provider: data?.provider,
              fallback: providerFallback,
            };
            const prev = (() => {
              try { return JSON.parse(localStorage.getItem("meridian:history") || "[]"); } catch { return []; }
            })();
            prev.unshift(entry);
            localStorage.setItem("meridian:history", JSON.stringify(prev.slice(0, 20)));
          } catch {
            /* ignore */
          }
          push({ kind: "system", text: "morning handoff ready" });
          break;
        case "error":
          setProviderFallback(true);
          push({ kind: "error", text: e.message });
          break;
        case "done":
          setPhase("done");
          esRef.current?.close();
          break;
      }
    },
    [push, speak, stopVoice, data, providerFallback],
  );

  const cancelShift = useCallback(() => {
    esRef.current?.close();
    stopVoice();
    setPhase("done");
    push({ kind: "system", text: "shift cancelled by operator" });
  }, [push, stopVoice]);

  const startShift = useCallback(() => {
    if (phase === "running") return;
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    esRef.current?.close();
    setPhase("running");
    setEntries([]);
    setBriefing(null);
    const params = new URLSearchParams(tripQuery.replace(/^\?/, ""));
    if (checkInsParam) params.set("checkins", checkInsParam);
    if (startDayParam) params.set("startDay", String(startDayParam));
    const es = new EventSource("/api/crew/run?" + params.toString());
    esRef.current = es;
    es.onmessage = (m) => handleEvent(JSON.parse(m.data) as CrewEvent);
    es.onerror = () => {
      push({ kind: "error", text: "stream interrupted" });
      setPhase("done");
      es.close();
    };
  }, [handleEvent, phase, push, tripQuery, checkInsParam, startDayParam]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (phase !== "running") startShift();
      } else if (e.code === "Escape" && phase === "running") {
        cancelShift();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, startShift, cancelShift]);
  const trip = data?.trip;

  return (
    <main className="flex min-h-screen flex-col p-4 lg:h-screen">
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
          <div className="flex items-center gap-2 rounded-lg border border-[#1e2637] bg-[#0c1018] px-2 py-1.5 font-mono2 text-[11px]">
            <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="bg-transparent text-[#e8eaf2]">
              {Object.keys(CITY_TABLE).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-[#ffc46b]">→</span>
            <select value={dest} onChange={(e) => setDest(e.target.value)} className="bg-transparent text-[#e8eaf2]">
              {Object.keys(CITY_TABLE).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="date"
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
              className="bg-transparent text-[#8b93a7]"
            />
          </div>
          {hasSavedPlan && (
            <Link
              href="/review"
              className="rounded-lg border border-[#1e2637] bg-[#0c1018] px-3 py-1.5 font-mono2 text-[11px] text-[#b8e356] transition-colors hover:border-[#b8e35644]"
            >
              view saved handoff →
            </Link>
          )}
          <Link
            href="/history"
            className="rounded-lg border border-[#1e2637] bg-[#0c1018] px-3 py-1.5 font-mono2 text-[11px] text-[#8b93a7] transition-colors hover:border-[#8b93a7]"
          >
            history
          </Link>
          {runCount > 0 && (
            <Link href="/history" className="rounded-lg border border-[#1e2637] bg-[#0c1018] px-3 py-1.5 font-mono2 text-[11px] text-[#8b93a7] transition-colors hover:border-[#8b93a7]">
              {runCount} runs
            </Link>
          )}
          {data && (
            <div className="rounded-lg border border-[#1e2637] bg-[#0c1018] px-3 py-1.5 font-mono2 text-[11px] text-[#4a5470]">
              {data.provider}{providerFallback ? " · fallback" : ""}
            </div>
          )}
          <button
            onClick={() => {
              const next = !voiceOn;
              voiceOnRef.current = next;
              setVoiceOn(next);
              if (!next) stopVoice();
            }}
            className={`rounded-lg border px-3 py-1.5 font-mono2 text-[11px] transition-colors ${
              voiceOn
                ? "border-[#7adfff44] bg-[#0c1018] text-[#7adfff] hover:border-[#7adfff]"
                : "border-[#1e2637] bg-[#0c1018] text-[#4a5470] hover:border-[#8b93a7]"
            }`}
          >
            voice {voiceOn ? "on" : "off"}
          </button>
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
          {phase === "running" && (
            <button
              onClick={cancelShift}
              className="rounded-lg border border-[#ff7a7a44] bg-[#ff7a7a11] px-3 py-2 text-xs font-bold text-[#ff7a7a] transition-colors hover:bg-[#ff7a7a22]"
            >
              cancel
            </button>
          )}
        </div>
      </header>

      {/* main grid */}
      {providerFallback && (
        <div className="mb-3 rounded-lg border border-[#ff7a7a44] bg-[#ff7a7a11] px-4 py-2 text-[12px] text-[#ff7a7a]">
          Crew fell back mid-run — review the plan before acting.
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
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
                fallback={providerFallback}
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
            {showOnboarding && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#07090fcc] backdrop-blur">
                <div className="max-w-md rounded-2xl border border-[#1e2637] bg-[#0c1018] p-6 shadow-xl">
                  <h2 className="text-sm font-bold tracking-[0.3em] text-[#e8eaf2]">WELCOME TO MERIDIAN</h2>
                  <p className="mt-3 text-[12px] leading-relaxed text-[#8b93a7]">
                    Meridian flies a crew of agents ahead of you. They read your wearable baseline, pull real circadian
                    literature, draft a day-by-day shift plan, score it against physiology and your calendar, then hand
                    you a calendar file.
                  </p>
                  <ul className="mt-3 space-y-1 text-[11px] text-[#8b93a7]">
                    <li>· <span className="text-[#e8eaf2]">Mara</span> analyst · wearable + adherence</li>
                    <li>· <span className="text-[#e8eaf2]">Jun</span> research · papers with DOIs</li>
                    <li>· <span className="text-[#e8eaf2]">Otto</span> planner · one day at a time</li>
                    <li>· <span className="text-[#e8eaf2]">Iris</span> eval · explains the scorer</li>
                    <li>· <span className="text-[#e8eaf2]">Rex</span> negotiator · reschedules events</li>
                  </ul>
                  <p className="mt-3 text-[11px] text-[#ff7a7a]">Agents propose; the deterministic scorer disposes.</p>
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => {
                        try { localStorage.setItem("meridian:onboarded", "1"); } catch {}
                        setShowOnboarding(false);
                      }}
                      className="rounded-lg bg-[#b8e356] px-4 py-2 text-xs font-bold text-[#07090f]"
                    >
                      Got it
                    </button>
                  </div>
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
