"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Compass, SlidersHorizontal, Sparkles, Volume2, VolumeX } from "lucide-react";
import { fmtMin } from "@/domain/circadian";
import { summarizeCheckIn } from "@/domain/adherence";
import type {
  CalendarEvent,
  CrewEvent,
  Trip,
  WearableBaseline,
} from "@/domain/types";
import { Button, Card } from "@/components/ui";
import { AnchoredPopover } from "@/components/AnchoredPopover";
import { type LogEntry } from "@/components/CrewFeed";
import { NudgeFeedScreen } from "@/components/NudgeFeedScreen";
import { TripSetupScreen } from "@/components/TripSetupScreen";
import { HandoffBanner } from "@/components/HandoffBanner";
import { AgentDrawer } from "@/components/AgentDrawer";
import { useRunState, calendarWithMoves, ledgerEvents, ghostGapDeg } from "@/state/run";
import { meetingReadiness } from "@/domain/readiness";
import { fallbackCitations } from "@/tools/science";
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

const DEFAULT_CITATIONS = fallbackCitations();

export default function Home() {
  const [activeScreen, setActiveScreen] = useState<"guide" | "setup">("guide");
  const [origin, setOrigin] = useState("LHR");
  const [dest, setDest] = useState("HND");
  const [departureDate, setDepartureDate] = useState("2026-10-18");
  const [selectedFlightId, setSelectedFlightId] = useState<string>("midday-afternoon");
  const [checkInsParam, setCheckInsParam] = useState("");
  const [startDayParam, setStartDayParam] = useState(0);
  const tripQuery = `?origin=${origin}&dest=${dest}&date=${departureDate}`;
  const { run, dispatch, reset } = useRunState();
  const [data, setData] = useState<TripData | null>(null);
  const [selectedDayLabel, setSelectedDayLabel] = useState<string>("D-3");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const [hasSavedPlan, setHasSavedPlan] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  // Agents are invisible by default — users only see behind-the-scenes work if they opt in.
  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);

  const trip = (run.trip ?? data?.trip ?? null) as Trip | null;

  const esRef = useRef<EventSource | null>(null);
  const [voiceOn, setVoiceOn] = useState(true);
  const voiceOnRef = useRef(true);
  const [voiceAvail, setVoiceAvail] = useState(false);
  const uttRef = useRef<
    Record<string, { uId: string; total: number; sent: number; pending: string; last: string }>
  >({});
  const uSeqRef = useRef(0);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const stopVoice = useCallback(() => {
    uttRef.current = {};
    stopVoiceAll();
  }, []);

  useEffect(() => {
    fetch("/api/trip" + tripQuery)
      .then((r) => r.json())
      .then((d: TripData) => {
        setData(d);
        if (d?.trip?.days?.[0]?.label) {
          setSelectedDayLabel(d.trip.days[0].label);
        }
      })
      .catch(() => {});
  }, [tripQuery]);

  const hook = trip
    ? { body: clockAt(trip.origin.utcOffsetMin), dest: clockAt(trip.destination.utcOffsetMin) }
    : null;

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        initVoice().then(setVoiceAvail);
        setHasSavedPlan(Boolean(localStorage.getItem("meridian:lastPlan")));
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
          if (e.trip.days[0]?.label) {
            setSelectedDayLabel(e.trip.days[0].label);
          }
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
          setSelectedDayLabel(e.day.label);
          break;
        case "eval_result":
          push({ kind: "eval", result: e.result });
          break;
        case "day_locked":
          push({ kind: "locked", label: e.day.label });
          setSelectedDayLabel(e.day.label);
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
            if (
              typeof window !== "undefined" &&
              "Notification" in window &&
              Notification.permission === "granted"
            ) {
              new Notification("Meridian plan ready", { body: e.summary });
            }
          } catch {
            /* ignore */
          }
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
            const entry = {
              id: Date.now(),
              savedAt: new Date().toISOString(),
              trip: (() => {
                try {
                  return JSON.parse(localStorage.getItem("meridian:lastTrip") || "null");
                } catch {
                  return null;
                }
              })(),
              score: e.score,
              summary: e.summary,
              days: e.days,
              provider: data?.provider,
              fallback: run.errors.length > 0,
            };
            const prev = (() => {
              try {
                return JSON.parse(localStorage.getItem("meridian:history") || "[]");
              } catch {
                return [];
              }
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

  const beginStream = useCallback(
    (extra?: { checkins?: string; startDay?: number }) => {
      if (run.phase === "running") return;
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "default"
      ) {
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
      } else if (e.code === "Escape") {
        if (agentDrawerOpen) setAgentDrawerOpen(false);
        else if (run.phase === "running") cancelShift();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [run.phase, startShift, cancelShift, agentDrawerOpen]);

  const providerFallback = run.errors.length > 0;
  const baseline = run.baseline ?? data?.baseline;
  const rawCalendar = run.calendar.length > 0 ? run.calendar : (data?.calendar ?? []);
  const currentEvents = run.calendar.length > 0 ? calendarWithMoves(run) : rawCalendar;
  const currentReadiness = trip
    ? meetingReadiness(trip, currentEvents, [...run.locked.values()], baseline)
    : [];
  const activeCitations = run.citations.length > 0 ? run.citations : DEFAULT_CITATIONS;

  return (
    <div className="min-h-screen overflow-x-hidden bg-ink text-paper">
      {/* Top Consumer Navigation Bar with Dedicated Screen Switcher */}
      <header className="sticky top-0 z-30 border-b border-line/80 bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveScreen("guide")}
              className="flex items-baseline gap-2.5 text-left"
            >
              <span className="text-base font-bold tracking-[0.28em] text-paper">MERIDIAN</span>
              <span className="hidden text-xs text-mist md:inline">
                Land at 100%
              </span>
            </button>
          </div>

          {/* Dedicated Two-Screen Navigation Pill */}
          <nav
            aria-label="Primary screens"
            className="inline-flex items-center rounded-full border border-line bg-ink-2 p-1"
          >
            <button
              type="button"
              onClick={() => setActiveScreen("guide")}
              aria-current={activeScreen === "guide" ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeScreen === "guide"
                  ? "bg-paper text-ink shadow-sm"
                  : "text-mist hover:text-paper"
              }`}
            >
              <Compass size={13} />
              <span>Daily Guide</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveScreen("setup")}
              aria-current={activeScreen === "setup" ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
                activeScreen === "setup"
                  ? "bg-paper text-ink shadow-sm"
                  : "text-mist hover:text-paper"
              }`}
            >
              <SlidersHorizontal size={13} />
              <span>Trip Setup</span>
            </button>
          </nav>

          <div className="flex items-center gap-2">
            {/* Voice toggle when available */}
            {voiceAvail && (
              <button
                type="button"
                onClick={() => {
                  const next = !voiceOn;
                  voiceOnRef.current = next;
                  setVoiceOn(next);
                  setVoiceEnabled(next);
                  if (!next) stopVoice();
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-ink-2 px-3 py-1.5 text-xs text-mist transition-colors hover:border-mist hover:text-paper"
                title={voiceOn ? "Mute voice briefing" : "Enable voice briefing"}
              >
                {voiceOn ? <Volume2 size={13} className="text-sun-dest" /> : <VolumeX size={13} />}
                <span className="hidden sm:inline">{voiceOn ? "Voice" : "Muted"}</span>
              </button>
            )}

            <div className="relative" ref={menuRef}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                Menu
              </Button>
              {menuOpen && (
                <AnchoredPopover anchorRef={menuRef}>
                  <Card className="w-52 p-2 shadow-xl">
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveScreen("guide");
                          setMenuOpen(false);
                        }}
                        className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-paper hover:bg-line"
                      >
                        Daily Guide (Nudges)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveScreen("setup");
                          setMenuOpen(false);
                        }}
                        className="w-full rounded-lg px-3 py-1.5 text-left text-xs text-paper hover:bg-line"
                      >
                        Trip &amp; Flight Setup
                      </button>
                      {hasSavedPlan && (
                        <Link
                          href="/review"
                          className="block rounded-lg px-3 py-1.5 text-xs text-mist hover:bg-line hover:text-paper"
                        >
                          Printable guide →
                        </Link>
                      )}
                      <Link
                        href="/history"
                        className="block rounded-lg px-3 py-1.5 text-xs text-mist hover:bg-line hover:text-paper"
                      >
                        Past trips {runCount > 0 ? `(${runCount})` : ""}
                      </Link>
                      <Link
                        href="/outcome"
                        className="block rounded-lg px-3 py-1.5 text-xs text-mist hover:bg-line hover:text-paper"
                      >
                        Log sleep outcome
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setAgentDrawerOpen(true);
                        }}
                        className="flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left text-xs text-mist hover:bg-line hover:text-paper"
                      >
                        <Sparkles size={12} className="text-sun-dest" />
                        Behind the scenes (AI)
                      </button>
                    </div>
                  </Card>
                </AnchoredPopover>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Focused Content Area */}
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
        {activeScreen === "guide" ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            {run.briefing && !briefingDismissed && (
              <HandoffBanner
                summary={run.briefing.summary}
                score={run.briefing.score}
                citations={run.briefing.citations}
                days={run.briefing.days}
                ics={run.briefing.ics}
                lines={run.briefing.lines}
                coverage={run.briefing.coverage}
                fallback={providerFallback}
                voiceAvailable={voiceAvail}
                onDismiss={() => setBriefingDismissed(true)}
              />
            )}

            <NudgeFeedScreen
              trip={trip}
              phase={run.phase}
              selectedDayLabel={selectedDayLabel}
              onSelectDay={setSelectedDayLabel}
              locked={run.locked}
              drafts={run.drafts}
              verdicts={run.verdicts}
              rejected={run.rejected}
              baseline={baseline}
              calendarEvents={currentEvents}
              moves={run.moves}
              citations={activeCitations}
              ics={run.briefing?.ics}
              selectedFlightId={selectedFlightId}
              onOpenTripSetup={() => setActiveScreen("setup")}
              onStartCrewSync={startShift}
            />
          </div>
        ) : (
          <TripSetupScreen
            trip={trip}
            origin={origin}
            dest={dest}
            departureDate={departureDate}
            onChangeRoute={(next) => {
              setOrigin(next.origin);
              setDest(next.dest);
              setDepartureDate(next.date);
              reset();
            }}
            selectedFlightId={selectedFlightId}
            onSelectFlightId={setSelectedFlightId}
            baseline={baseline}
            calendar={currentEvents}
            calendarSource={data?.calendarSource}
            readiness={currentReadiness}
            hook={hook}
            phase={run.phase}
            lockedCount={run.locked.size}
            totalDays={trip?.days.length ?? 5}
            sessionStartedAt={run.sessionStartedAt}
            locked={run.locked}
            drafts={run.drafts}
            verdicts={run.verdicts}
            activeLabel={run.activeLabel}
            activeAgent={run.activeAgent}
            sunProgress={run.sunProgress}
            ghostGap={ghostGapDeg(run)}
            citations={activeCitations}
            ics={run.briefing?.ics}
            onStart={startShift}
            onCancel={cancelShift}
            onCheckIn={(extra) => beginStream(extra)}
            onBackToGuide={() => setActiveScreen("guide")}
          />
        )}
      </main>

      {/* Optional Behind-the-Scenes Drawer (Default Closed / Invisible) */}
      <AgentDrawer
        open={agentDrawerOpen}
        onClose={() => setAgentDrawerOpen(false)}
        entries={entries}
        events={ledgerEvents(run)}
        running={run.phase === "running"}
        activeAgent={run.activeAgent}
        toolCalls={run.toolCalls}
        lockedDays={run.locked.size}
      />
    </div>
  );
}
