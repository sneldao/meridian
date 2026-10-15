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
import { AnchoredPopover } from "@/components/AnchoredPopover";
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
import { initVoice, setVoiceEnabled, speakDialogue, speakOnce, speakSentence, stopAll as stopVoiceAll } from "@/lib/voice/engine";
import { takeChunks } from "@/lib/voice/split";

interface TripData {
  trip: Trip;
  baseline: WearableBaseline;
  calendar: CalendarEvent[];
  calendarSource?: "google" | "fixture";
  provider: string;
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
  const [voiceAvail, setVoiceAvail] = useState(false);
  // Per-agent utterance state: pending token buffer, chars already dispatched
  // to TTS, total display chars, and the current utterance id (karaoke key).
  const uttRef = useRef<Record<string, { uId: string; total: number; sent: number; pending: string; last: string }>>({});
  const uSeqRef = useRef(0);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const stopVoice = useCallback(() => {
    uttRef.current = {};
    stopVoiceAll();
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
        initVoice().then(setVoiceAvail);
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
          uttRef.current[e.agent] = {
            uId: `${e.agent}-${++uSeqRef.current}`,
            total: 0,
            sent: 0,
            pending: "",
            last: "",
          };
          break;
        case "agent_token": {
          const u = uttRef.current[e.agent];
          const uStart = u ? u.total : undefined;
          setEntries((prev) => {
            const last = prev[prev.length - 1];
            if (last?.kind === "text" && last.agent === e.agent) {
              return [...prev.slice(0, -1), { ...last, text: last.text + e.text }];
            }
            return [...prev, { kind: "text", agent: e.agent, text: e.text, uId: u?.uId, uStart }];
          });
          if (u) {
            u.total += e.text.length;
            u.pending += e.text;
            const { chunks, rest } = takeChunks(u.pending);
            const base = u.sent;
            for (const c of chunks) {
              speakSentence({ uId: u.uId, agent: e.agent, text: c.text, charBase: base + c.start, prev: u.last || undefined });
              u.last = c.text;
            }
            u.sent += u.pending.length - rest.length;
            u.pending = rest;
          }
          break;
        }
        case "agent_end": {
          const u = uttRef.current[e.agent];
          if (u) {
            const { chunks } = takeChunks(u.pending, { flush: true });
            const base = u.sent;
            chunks.forEach((c, i) => {
              speakSentence({
                uId: u.uId,
                agent: e.agent,
                text: c.text,
                charBase: base + c.start,
                prev: u.last || undefined,
                utterTotal: i === chunks.length - 1 ? u.total : undefined,
              });
              u.last = c.text;
            });
            if (!chunks.length) {
              speakSentence({ uId: u.uId, agent: e.agent, text: "", charBase: base, utterTotal: u.total });
            }
          }
          delete uttRef.current[e.agent];
          break;
        }
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
          if (e.lines?.length) speakDialogue(e.lines);
          else speakOnce(e.summary, "handoff");
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
              JSON.stringify({ summary: e.summary, score: e.score, citations: e.citations, days: e.days, ics: e.ics, lines: e.lines }),
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
    [push, stopVoice, data, run.errors.length],
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
            <h1 className="text-lg font-bold tracking-[0.3em] text-paper">MERIDIAN</h1>
            <span className="text-[12px] tracking-wide text-mist">
              agents that fly ahead of you
            </span>
          </div>
        </div>

        {baseline && (
          <div
            className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-line bg-ink-2 px-3 py-1.5 font-mono2 text-[12px] text-mist xl:flex"
            title="From the wearable baseline — who this plan is shaped around"
          >
            <MoonStar size={12} className="text-sleep" />
            <span className="text-paper">{baseline.chronotype}</span> · {fmtMin(baseline.avgBedtimeMin)}→{fmtMin(baseline.avgWakeMin)}
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
              ? "cursor-not-allowed bg-line text-dim"
              : "bg-paper text-ink hover:bg-white"
          }`}
        >
          {run.phase === "running" ? "shift in progress…" : run.phase === "done" ? "run it again" : "start the night shift"}
        </button>
        {run.phase === "running" && (
          <button
            onClick={cancelShift}
            className="shrink-0 rounded-lg border border-fail/27 bg-fail/7 px-3 py-2 text-xs font-bold text-fail transition-colors hover:bg-fail/13"
          >
            cancel
          </button>
        )}
        <MorningCheckin
          phase={run.phase}
          lockedCount={run.locked.size}
          totalDays={trip?.days.length ?? 5}
          sessionStartedAt={run.sessionStartedAt}
          onCheckIn={(extra) => beginStream(extra)}
        />

        <div className="relative ml-auto shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg border border-line bg-ink-2 px-3 py-1.5 font-mono2 text-[12px] text-mist transition-colors hover:border-mist"
          >
            menu
          </button>
          {menuOpen && (
            <AnchoredPopover anchorRef={menuRef}>
              <div className="w-52 rounded-xl border border-line bg-ink-2 p-2 shadow-xl">
                <div className="space-y-1">
                  {hasSavedPlan && (
                    <Link href="/review" className="block rounded-lg px-3 py-1.5 text-[12px] text-paper hover:bg-line">
                      view saved handoff →
                    </Link>
                  )}
                  <Link href="/history" className="block rounded-lg px-3 py-1.5 text-[12px] text-mist hover:bg-line">
                    history
                  </Link>
                  {runCount > 0 && (
                    <Link href="/history" className="block rounded-lg px-3 py-1.5 text-[12px] text-mist hover:bg-line">
                      {runCount} runs
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      if (!voiceAvail) return;
                      const next = !voiceOn;
                      voiceOnRef.current = next;
                      setVoiceOn(next);
                      setVoiceEnabled(next);
                      if (!next) stopVoice();
                      setMenuOpen(false);
                    }}
                    disabled={!voiceAvail}
                    title={voiceAvail ? undefined : "No ElevenLabs key on this deployment"}
                    className="w-full rounded-lg px-3 py-1.5 text-left text-[12px] text-mist hover:bg-line hover:text-paper disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-mist"
                  >
                    voice {voiceAvail ? (voiceOn ? "on" : "off") : "unavailable"}
                  </button>
                  {providerLabel && (
                    <div className="rounded-lg px-3 py-1.5 text-[12px] text-dim">
                      {providerLabel}{providerFallback ? " · fallback" : ""}
                    </div>
                  )}
                </div>
              </div>
            </AnchoredPopover>
          )}
        </div>
      </header>

      {showOnboarding && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-line bg-ink-2 px-4 py-2 text-[12px] text-mist">
          <span className="text-paper">First run?</span>
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
            className="ml-auto shrink-0 rounded-lg border border-line px-3 py-1 text-[12px] text-mist transition-colors hover:text-paper"
          >
            got it
          </button>
        </div>
      )}

      {providerFallback && (
        <div className="mb-3 rounded-lg border border-fail/27 bg-fail/7 px-4 py-2 text-[12px] text-fail">
          Crew fell back mid-run — review the plan before acting.
        </div>
      )}
      {data?.calendarSource === "fixture" && (
        <div className="mb-3 rounded-lg border border-line bg-ink-2 px-4 py-2 text-[12px] text-mist">
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
                lines={run.briefing.lines}
                coverage={run.briefing.coverage}
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
                    <p className="font-voice text-3xl leading-snug text-paper">
                      It&apos;s {hook.body} in your body.
                    </p>
                    <p className="mt-1 font-mono2 text-[12px] text-mist">
                      It&apos;s {hook.dest} in {trip?.destination.name ?? "your destination"}.
                    </p>
                  </>
                ) : (
                  <p className="font-voice text-2xl text-paper">
                    Your body clock is still in {trip?.origin.name ?? "London"}.
                  </p>
                )}
                <p className="mt-4 text-[12px] leading-relaxed text-mist">
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
                        <span className="text-paper">{CREW[id].name}</span>
                      </span>
                    );
                  })}
                </div>
                <p className="mt-4 font-mono2 text-[12px] text-dim">press space, or start the night shift</p>
              </div>
            </div>
          )}
          {trip && (
            <DayStrip days={trip.days} locked={run.locked} activeLabel={run.activeLabel} rejectedLabels={run.rejected} />
          )}
        </div>

        <div className="min-h-0 overflow-hidden rounded-2xl border border-line bg-ink-2 p-3">
          <CrewFeed entries={entries} running={run.phase === "running"} />
        </div>
      </div>
    </main>
  );
}