"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MoonStar, Volume2, VolumeX } from "lucide-react";
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
import { Button, Card, KeyHint, AgentChip } from "@/components/ui";
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
import {
  initVoice,
  setVoiceEnabled,
  speakDialogue,
  speakOnce,
  speakSentence,
  stopAll as stopVoiceAll,
  subscribeVoiceErrors,
} from "@/lib/voice/engine";
import { takeChunks } from "@/lib/voice/split";
import { easeSmoothOut } from "@/lib/motion";

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

export default function CrewOperatorPage() {
  const reduce = useReducedMotion();
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

  const trip = (run.trip ?? data?.trip ?? null) as Trip | null;

  const esRef = useRef<EventSource | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const voiceOnRef = useRef(true);
  const [voiceAvail, setVoiceAvail] = useState(false);
  const uttRef = useRef<
    Record<string, { uId: string; total: number; sent: number; pending: string; last: string }>
  >({});
  const uSeqRef = useRef(0);

  const stopVoice = useCallback(() => {
    uttRef.current = {};
    stopVoiceAll();
  }, []);

  useEffect(() => {
    fetch("/api/trip" + tripQuery)
      .then((r) => r.json())
      .then((d: TripData) => setData(d))
      .catch(() => {});
  }, [tripQuery]);

  const hook = trip
    ? { body: clockAt(trip.origin.utcOffsetMin), dest: clockAt(trip.destination.utcOffsetMin) }
    : null;

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        initVoice().then(setVoiceAvail);
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

  useEffect(() => {
    return subscribeVoiceErrors((err) => {
      push({
        kind: "error",
        text: err.fatal ? `voice unavailable: ${err.message}` : `voice: ${err.message}`,
      });
    });
  }, [push]);

  const handleSideEffects = useCallback(
    (e: CrewEvent) => {
      switch (e.type) {
        case "run_start":
          stopVoice();
          setEntries([{ kind: "system", text: "shift started — crew assembling" }]);
          setBriefingDismissed(false);
          try {
            localStorage.setItem("meridian:onboarded", "1");
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
              speakSentence({
                uId: u.uId,
                agent: e.agent,
                text: c.text,
                charBase: base + c.start,
                prev: u.last || undefined,
              });
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
              speakSentence({
                uId: u.uId,
                agent: e.agent,
                text: "",
                charBase: base,
                utterTotal: u.total,
              });
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
          break;
        case "eval_result":
          push({ kind: "eval", result: e.result });
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
          try {
            localStorage.setItem(
              "meridian:lastPlan",
              JSON.stringify({
                summary: e.summary,
                score: e.score,
                citations: e.citations,
                days: e.days,
                ics: e.ics,
                lines: e.lines,
              }),
            );
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
    [push, stopVoice],
  );

  const cancelShift = useCallback(() => {
    esRef.current?.close();
    stopVoice();
    push({ kind: "system", text: "shift cancelled by operator" });
    reset();
  }, [push, stopVoice, reset]);

  const beginStream = useCallback(
    (extra?: { checkins?: string; startDay?: number }) => {
      if (run.phase === "running") return;
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
    },
    [dispatch, handleSideEffects, push, reset, run.phase, tripQuery, checkInsParam, startDayParam],
  );

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

  const providerFallback = run.errors.length > 0;
  const baseline = run.baseline ?? data?.baseline;

  return (
    <main className="flex min-h-screen flex-col bg-ink p-4 text-paper lg:h-screen">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <div className="shrink-0">
          <div className="flex items-baseline gap-3">
            <Link
              href="/"
              className="rounded-full border border-line bg-ink-2 px-3 py-1 text-xs font-semibold text-mist transition hover:border-paper hover:text-paper"
            >
              ← 24h Dial
            </Link>
            <h1 className="text-lg font-bold tracking-[0.3em] text-paper">MERIDIAN</h1>
            <span className="rounded-full border border-sun-dest/40 bg-sun-dest/10 px-2.5 py-0.5 font-mono2 text-[11px] text-sun-dest">
              Operator Lens · Simulated Agent Trace
            </span>
          </div>
        </div>

        {baseline && (
          <div
            className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-line bg-ink-2 px-3 py-1.5 font-mono2 text-xs text-mist xl:flex"
            title="Habitual sleep baseline"
          >
            <MoonStar size={12} className="text-sleep" />
            <span className="text-paper">{baseline.chronotype}</span> ·{" "}
            {fmtMin(baseline.avgBedtimeMin)}→{fmtMin(baseline.avgWakeMin)}
          </div>
        )}

        <div className="shrink-0">
          <RoutePicker
            origin={origin}
            dest={dest}
            date={departureDate}
            onChange={(next) => {
              setOrigin(next.origin);
              setDest(next.dest);
              setDepartureDate(next.date);
              reset();
            }}
            disabled={run.phase === "running"}
          />
        </div>

        <Button
          onClick={startShift}
          disabled={run.phase === "running"}
          variant="primary"
        >
          {run.phase === "running"
            ? "shift in progress…"
            : run.phase === "done"
              ? "run it again"
              : "start the night shift"}
        </Button>

        {run.phase === "running" && (
          <Button variant="danger" onClick={cancelShift}>
            cancel
          </Button>
        )}

        <MorningCheckin
          phase={run.phase}
          lockedCount={run.locked.size}
          totalDays={trip?.days.length ?? 5}
          sessionStartedAt={run.sessionStartedAt}
          onCheckIn={(extra) => beginStream(extra)}
        />

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !voiceOn;
              voiceOnRef.current = next;
              setVoiceOn(next);
              setVoiceEnabled(next);
              if (!next) stopVoice();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-ink-2 px-3 py-1.5 text-xs text-mist transition hover:text-paper"
          >
            {voiceOn ? (
              <Volume2 size={13} className="text-sun-dest" />
            ) : (
              <VolumeX size={13} />
            )}
            <span>{voiceOn ? "Voice" : "Muted"}</span>
          </button>
          <Link
            href="/review"
            className="rounded-lg border border-line bg-ink-2 px-3 py-1.5 text-xs text-mist transition hover:text-paper"
          >
            Review →
          </Link>
        </div>
      </header>

      {providerFallback && (
        <div className="mb-3 rounded-lg border border-fail/20 bg-fail/10 px-4 py-2 text-xs text-fail">
          Crew fell back mid-run — review the plan before acting.
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
                    readiness={meetingReadiness(
                      trip,
                      calendarWithMoves(run),
                      [...run.locked.values()],
                    )}
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

            {run.phase === "idle" && (
              <motion.div
                initial={reduce ? false : { opacity: 0, scale: 0.98, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.45, ease: easeSmoothOut }}
                className="absolute inset-0 z-10 flex items-center justify-center p-6"
              >
                <Card className="max-w-md border-mist/20 p-6 text-center shadow-2xl">
                  {hook ? (
                    <>
                      <p className="font-voice text-2xl leading-snug text-paper">
                        It&apos;s {hook.body} in your body.
                      </p>
                      <p className="mt-1 font-mono2 text-xs text-mist">
                        It&apos;s {hook.dest} in{" "}
                        {trip?.destination.name ?? "your destination"}.
                      </p>
                    </>
                  ) : (
                    <p className="font-voice text-2xl text-paper">
                      Your body clock is still in {trip?.origin.name ?? "London"}.
                    </p>
                  )}
                  <p className="mt-4 text-xs leading-relaxed text-mist">
                    {data
                      ? "Simulated multi-agent trace: inspect deterministic constraint solving, FalkorDB provenance, and schedule verification."
                      : "reading your calendar…"}
                  </p>

                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {(Object.keys(CREW) as AgentId[]).map((id) => (
                      <AgentChip key={id} id={id} />
                    ))}
                  </div>

                  <div className="mt-5 flex justify-center">
                    <Button onClick={startShift}>Start the night shift</Button>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-mono2 text-xs text-dim">
                    <span className="inline-flex items-center gap-1">
                      <KeyHint>space</KeyHint> to start
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <KeyHint>1</KeyHint>
                      <KeyHint>2</KeyHint>
                      <KeyHint>3</KeyHint>
                      <KeyHint>4</KeyHint> to switch views
                    </span>
                  </div>
                </Card>
              </motion.div>
            )}
          </LensShell>

          {run.briefing && !briefingDismissed && (
            <div className="pointer-events-auto absolute right-3 bottom-14 left-3 z-20 max-h-[45%] overflow-y-auto rounded-xl">
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

          {trip && (
            <DayStrip
              days={trip.days}
              locked={run.locked}
              activeLabel={run.activeLabel}
              rejectedLabels={run.rejected}
            />
          )}
        </div>

        <Card className="min-h-0 overflow-hidden p-3">
          <CrewFeed entries={entries} running={run.phase === "running"} />
        </Card>
      </div>
    </main>
  );
}
