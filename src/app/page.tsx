"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import { summarizeCheckIn } from "@/domain/adherence";
import type {
  AgentId,
  CalendarEvent,
  CrewEvent,
  Trip,
  WearableBaseline,
} from "@/domain/types";
import { CREW } from "@/agents/crew";
import { AGENT_ICONS } from "@/lib/agent-icons";
import { MoonStar } from "lucide-react";
import { BriefingCard } from "@/components/BriefingCard";
import { MorningCheckin } from "@/components/MorningCheckin";
import { LensShell, type LensId } from "@/components/lenses/LensShell";
import { WorldLens } from "@/components/lenses/WorldLens";
import { CrewFeed, type LogEntry } from "@/components/CrewFeed";
import { DayStrip } from "@/components/DayStrip";
import { RoutePicker } from "@/components/RoutePicker";
import { ShiftBoard } from "@/components/lenses/ShiftBoard";
import { CalendarLens } from "@/components/lenses/CalendarLens";
import { Ledger } from "@/components/lenses/Ledger";
import { useRunState, calendarWithMoves, ledgerEvents, ghostGapDeg } from "@/state/run";
import { meetingReadiness } from "@/domain/readiness";

interface TripData {
  trip: Trip;
  baseline: WearableBaseline;
  calendar: CalendarEvent[];
  calendarSource?: "google" | "fixture";
  provider: string;
}

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

/** Wall-clock time (HH:MM) in a city, from its DST-aware UTC offset. */
function clockAt(offsetMin: number, now = new Date()): string {
  return fmtMin(now.getUTCHours() * 60 + now.getUTCMinutes() + offsetMin);
}

export default function Home() {
  const [origin, setOrigin] = useState("LHR");
  const [dest, setDest] = useState("HND");
  const [departureDate, setDepartureDate] = useState("2026-10-18");
  const [checkInsParam, setCheckInsParam] = useState("");
  const [startDayParam, setStartDayParam] = useState(0);
  const tripQuery = `?origin=${origin}&dest=${dest}&date=${departureDate}`;
  const { run, dispatch, reset } = useRunState();
  const [data, setData] = useState<TripData | null>(null);
  const [selectedLens, setSelectedLens] = useState<LensId>("world");
  const [autoDirector, setAutoDirector] = useState(true);
  const lens = autoDirector ? ((run.focus ?? selectedLens) as LensId) : selectedLens;
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const [hasSavedPlan, setHasSavedPlan] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const trip = (run.trip ?? data?.trip ?? null) as Trip | null;

  const esRef = useRef<EventSource | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const voiceOnRef = useRef(true);
  const utterRef = useRef<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceQueueRef = useRef<{ agent: string; text: string }[]>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  // The opening hook — the wearer's body time against the destination's.
  // Derived during render (no setState in an effect) and only reachable once
  // the trip is known, which is always after hydration, so there is no clock
  // on the server-rendered HTML.
  const hook = trip
    ? { body: clockAt(trip.origin.utcOffsetMin), dest: clockAt(trip.destination.utcOffsetMin) }
    : null;

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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  const push = useCallback((e: LogEntry) => {
    setEntries((prev) => [...prev, e]);
  }, []);

  const handleSideEffects = useCallback(
    (e: CrewEvent) => {
      switch (e.type) {
        case "run_start":
          stopVoice();
          setEntries([{ kind: "system", text: "shift started — crew assembling" }]);
          setBriefingDismissed(false);
          // Never let the welcome modal cover a running shift (fresh browser on stage).
          setShowOnboarding(false);
          try { localStorage.setItem("meridian:onboarded", "1"); } catch { /* ignore */ }
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
          break;
        case "plan_candidate":
          // Grid state is owned by run state; live progress follows the day_label.
          break;
        case "eval_result":
          push({ kind: "eval", result: e.result });
          if (!e.result.feasible) {
            // rhetorical no-op so the right-hand feed still tells the story.
          }
          break;
        case "day_locked":
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
              fallback: run.errors.length > 0,
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
          push({ kind: "error", text: e.message });
          break;
        case "done":
          setEntries((prev) => [...prev, { kind: "system", text: "shift complete" }]);
          esRef.current?.close();
          break;
      }
    },
    [push, speak, stopVoice, data, run.errors.length],
  );

  const cancelShift = useCallback(() => {
    esRef.current?.close();
    stopVoice();
    push({ kind: "system", text: "shift cancelled by operator" });
    reset();
  }, [push, stopVoice, reset]);

  const beginStream = useCallback((extra?: { checkins?: string; startDay?: number }) => {
    if (run.phase === "running") return;
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    esRef.current?.close();
    reset();
    setEntries([]);
    setBriefingDismissed(false);
    const params = new URLSearchParams(tripQuery.replace(/^\?/, ""));
    if (extra?.checkins) params.set("checkins", extra.checkins);
    else if (checkInsParam) params.set("checkins", checkInsParam);
    if (extra?.startDay !== undefined) params.set("startDay", String(extra.startDay));
    else if (startDayParam) params.set("startDay", String(startDayParam));
    const es = new EventSource("/api/crew/run?" + params.toString());
    esRef.current = es;
    es.onmessage = (m) => {
      const evt = JSON.parse(m.data) as CrewEvent;
      dispatch(evt);
      handleSideEffects(evt);
    };
    es.onerror = () => {
      push({ kind: "error", text: "stream interrupted" });
      es.close();
    };
  }, [dispatch, handleSideEffects, push, reset, run.phase, tripQuery, checkInsParam, startDayParam]);

  const startShift = useCallback(() => beginStream(), [beginStream]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (run.phase !== "running") startShift();
      } else if (e.code === "Escape" && run.phase === "running") {
        cancelShift();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [run.phase, startShift, cancelShift]);

  const chooseLens = useCallback((id: LensId) => {
    setSelectedLens(id);
    setAutoDirector(false);
  }, []);

  // Director is derived below; no synchronous state update in an effect.

  const providerFallback = run.errors.length > 0;
  const journey = data?.provider;
  const providerLabel = journey ?? run.provider ?? process.env.NEXT_PUBLIC_AGENT_PROVIDER;
  const baseline = run.baseline ?? data?.baseline;

  return (
    <main className="flex min-h-screen flex-col p-4 lg:h-screen">
      <header className="mb-4 flex items-center gap-3 overflow-x-auto">
        <div className="shrink-0">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold tracking-[0.3em] text-[#e8eaf2]">MERIDIAN</h1>
            <span className="text-[12px] tracking-wide text-[#8b93a7]">
              agents that fly ahead of you
            </span>
          </div>
        </div>

        {baseline && (
          <div
            className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-[#1e2637] bg-[#0c1018] px-3 py-1.5 font-mono2 text-[12px] text-[#8b93a7] xl:flex"
            title="From the wearable baseline — who this plan is shaped around"
          >
            <MoonStar size={12} className="text-[#b8a8ff]" />
            <span className="text-[#e8eaf2]">{baseline.chronotype}</span> · {fmtMin(baseline.avgBedtimeMin)}→{fmtMin(baseline.avgWakeMin)}
          </div>
        )}

        <div className="shrink-0">
          <RoutePicker origin={origin} dest={dest} date={departureDate} onChange={(next) => {
              setOrigin(next.origin);
              setDest(next.dest);
              setDepartureDate(next.date);
              reset(); // the previous run's trip/briefing belong to the old route
            }} disabled={run.phase === "running"} />
        </div>

        <button
          onClick={startShift}
          disabled={run.phase === "running"}
          className={`shrink-0 rounded-lg px-5 py-2 text-xs font-bold transition-colors ${
            run.phase === "running"
              ? "cursor-not-allowed bg-[#1e2637] text-[#4a5470]"
              : "bg-[#b8e356] text-[#07090f] hover:bg-[#cff27e]"
          }`}
        >
          {run.phase === "running" ? "shift in progress…" : run.phase === "done" ? "run it again" : "start the night shift"}
        </button>
        {run.phase === "running" && (
          <button
            onClick={cancelShift}
            className="shrink-0 rounded-lg border border-[#ff7a7a44] bg-[#ff7a7a11] px-3 py-2 text-xs font-bold text-[#ff7a7a] transition-colors hover:bg-[#ff7a7a22]"
          >
            cancel
          </button>
        )}
        <MorningCheckin phase={run.phase} onCheckIn={(extra) => beginStream(extra)} />

        <div className="relative ml-auto shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg border border-[#1e2637] bg-[#0c1018] px-3 py-1.5 font-mono2 text-[12px] text-[#8b93a7] transition-colors hover:border-[#8b93a7]"
          >
            menu
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-xl border border-[#1e2637] bg-[#0c1018] p-2 shadow-xl">
              <div className="space-y-1">
                {hasSavedPlan && (
                  <Link href="/review" className="block rounded-lg px-3 py-1.5 text-[12px] text-[#b8e356] hover:bg-[#1e2637]">
                    view saved handoff →
                  </Link>
                )}
                <Link href="/history" className="block rounded-lg px-3 py-1.5 text-[12px] text-[#8b93a7] hover:bg-[#1e2637]">
                  history
                </Link>
                {runCount > 0 && (
                  <Link href="/history" className="block rounded-lg px-3 py-1.5 text-[12px] text-[#8b93a7] hover:bg-[#1e2637]">
                    {runCount} runs
                  </Link>
                )}
                <button
                  onClick={() => {
                    const next = !voiceOn;
                    voiceOnRef.current = next;
                    setVoiceOn(next);
                    if (!next) stopVoice();
                    setMenuOpen(false);
                  }}
                  className="w-full rounded-lg px-3 py-1.5 text-left text-[12px] text-[#7adfff] hover:bg-[#1e2637]"
                >
                  voice {voiceOn ? "on" : "off"}
                </button>
                {providerLabel && (
                  <div className="rounded-lg px-3 py-1.5 text-[12px] text-[#4a5470]">
                    {providerLabel}{providerFallback ? " · fallback" : ""}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {showOnboarding && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-[#1e2637] bg-[#0c1018] px-4 py-2 text-[12px] text-[#8b93a7]">
          <span className="text-[#e8eaf2]">First run?</span>
          <span className="hidden md:inline">
            Agents propose; the deterministic scorer disposes.
          </span>
          <span className="hidden lg:inline">
            Press space to send the crew out, then watch the plan lock day by day.
          </span>
          <button
            onClick={() => {
              try { localStorage.setItem("meridian:onboarded", "1"); } catch { /* ignore */ }
              setShowOnboarding(false);
            }}
            className="ml-auto shrink-0 rounded-lg border border-[#1e2637] px-3 py-1 text-[12px] text-[#8b93a7] transition-colors hover:text-[#e8eaf2]"
          >
            got it
          </button>
        </div>
      )}

      {providerFallback && (
        <div className="mb-3 rounded-lg border border-[#ff7a7a44] bg-[#ff7a7a11] px-4 py-2 text-[12px] text-[#ff7a7a]">
          Crew fell back mid-run — review the plan before acting.
        </div>
      )}
      {data?.calendarSource === "fixture" && (
        <div className="mb-3 rounded-lg border border-[#ffc46b44] bg-[#ffc46b11] px-4 py-2 text-[12px] text-[#ffc46b]">
          Sample calendar in use — your live Google Calendar isn&apos;t being read.
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="relative flex min-h-0 flex-col gap-3">
          <LensShell
            lens={lens}
            onChange={chooseLens}
            auto={autoDirector}
            onToggleAuto={() => setAutoDirector((v) => !v)}
            running={run.phase === "running"}
            elapsedMs={run.elapsedMs}
            toolCalls={run.toolCalls}
            lockedDays={run.locked.size}
          >
            {lens === "world" && (
              <WorldLens
                trip={trip}
                progress={run.sunProgress}
                lockedLabels={new Set(run.locked.keys())}
                activeLabel={run.activeLabel}
                citationCount={run.citations.length}
                running={run.phase === "running"}
                ghostGap={ghostGapDeg(run)}
              />
            )}
            {lens === "board" && (
              <div className="relative h-full w-full">
                {trip && (
                  <ShiftBoard
                    days={trip.days}
                    drafts={run.drafts}
                    verdicts={run.verdicts}
                    locked={run.locked}
                    activeLabel={run.activeLabel}
                    activeAgent={run.activeAgent}
                  />
                )}
              </div>
            )}
            {lens === "calendar" && (
              <div className="h-full w-full">
                {trip && (
                  <CalendarLens
                    days={trip.days}
                    events={calendarWithMoves(run)}
                    readiness={meetingReadiness(trip, calendarWithMoves(run), [...run.locked.values()])}
                    ics={run.briefing?.ics}
                  />
                )}
              </div>
            )}
            {lens === "ledger" && (
              <div className="h-full w-full">
                <Ledger events={ledgerEvents(run)} />
              </div>
            )}
          </LensShell>

          {run.briefing && !briefingDismissed && (
            <div className="pointer-events-auto absolute bottom-14 left-3 right-3 z-20 max-h-[45%] overflow-y-auto rounded-xl">
              <BriefingCard
                summary={run.briefing.summary}
                score={run.briefing.score}
                citations={run.briefing.citations}
                days={run.briefing.days}
                ics={run.briefing.ics}
                fallback={providerFallback}
                onClose={() => setBriefingDismissed(true)}
              />
            </div>
          )}

          {run.phase === "idle" && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
              <div className="max-w-xl text-center">
                {hook ? (
                  <>
                    <p className="font-voice text-3xl leading-snug text-[#e8eaf2]">
                      It&apos;s {hook.body} in your body.
                    </p>
                    <p className="mt-1 font-mono2 text-[12px] text-[#8b93a7]">
                      It&apos;s {hook.dest} in {trip?.destination.name ?? "your destination"}.
                    </p>
                  </>
                ) : (
                  <p className="font-voice text-2xl text-[#e8eaf2]">
                    Your body clock is still in {trip?.origin.name ?? "London"}.
                  </p>
                )}
                <p className="mt-4 text-[12px] leading-relaxed text-[#8b93a7]">
                  {data
                    ? "Five agents read your wearable, pull the science, then rewrite your week around the shift."
                    : "reading your calendar…"}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[12px]">
                  {(Object.keys(CREW) as AgentId[]).map((id) => {
                    const Icon = AGENT_ICONS[id];
                    return (
                      <span key={id} className="inline-flex items-center gap-1.5" title={CREW[id].title}>
                        <Icon size={14} style={{ color: CREW[id].color }} />
                        <span className="text-[#e8eaf2]">{CREW[id].name}</span>
                      </span>
                    );
                  })}
                </div>
                <p className="mt-4 font-mono2 text-[12px] text-[#4a5470]">press space, or start the night shift</p>
              </div>
            </div>
          )}
          {trip && (
            <DayStrip days={trip.days} locked={run.locked} activeLabel={run.activeLabel} rejectedLabels={run.rejected} />
          )}
        </div>

        <div className="min-h-0 overflow-hidden rounded-2xl border border-[#1e2637] bg-[#0c1018] p-3">
          <CrewFeed entries={entries} running={run.phase === "running"} />
        </div>
      </div>
    </main>
  );
}