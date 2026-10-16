"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import { summarizeCheckIn } from "@/domain/adherence";
import type {
  AdherenceProfile,
  CalendarEvent,
  CrewEvent,
  Trip,
  WearableBaseline,
} from "@/domain/types";
import { type LogEntry } from "@/components/CrewFeed";
import { NudgeFeedScreen } from "@/components/NudgeFeedScreen";
import { TripSetupScreen } from "@/components/TripSetupScreen";
import { HandoffBanner } from "@/components/HandoffBanner";
import { AgentDrawer } from "@/components/AgentDrawer";
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

interface TripData {
  trip: Trip;
  baseline: WearableBaseline;
  /** Whether `baseline` is real wearable data or the demo fixture. Surfaced
   *  so the UI can tag demo numbers instead of passing them off as measured. */
  baselineSource?: "fixture" | "garmin";
  /** Compliance hints (e.g. ignoresInterventionsBeforeMin) that keep asks
   *  off the hours the traveller actually ignores them. */
  adherence?: AdherenceProfile;
  calendar: CalendarEvent[];
  calendarSource?: "google" | "fixture";
  provider: string;
}

/** Wall-clock time (HH:MM) in a city, from its DST-aware UTC offset. */
function clockAt(offsetMin: number, now = new Date()): string {
  return fmtMin(now.getUTCHours() * 60 + now.getUTCMinutes() + offsetMin);
}

function isValidDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

/** Consumer default departure: three days out, in the *viewer's* local date, so
 *  the trip always has a "today" to act on. Deliberately not derived at render
 *  time — the server and the browser can disagree on the calendar day, which
 *  would be a hydration mismatch. Called from a mount effect instead. */
function defaultDepartureDate(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const MEMORY_TOOL_NAMES = new Set([
  "recallFindings",
  "priorFailures",
  "calendarConflicts",
  "crewMemory",
  "recall_findings",
  "crew_memory",
]);

export default function Home() {
  const [activeScreen, setActiveScreen] = useState<"guide" | "setup">("guide");
  const [origin, setOrigin] = useState("LHR");
  const [dest, setDest] = useState("HND");
  const [departureDate, setDepartureDate] = useState("");
  const [selectedFlightId, setSelectedFlightId] = useState<string>("midday-afternoon");
  const [checkInsParam, setCheckInsParam] = useState("");
  const [startDayParam, setStartDayParam] = useState(0);
  const tripQuery = `?origin=${origin}&dest=${dest}&date=${departureDate}`;
  const { run, dispatch, reset } = useRunState();
  const [data, setData] = useState<TripData | null>(null);
  const [selectedDayLabel, setSelectedDayLabel] = useState<string>("D-1");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const [hasSavedPlan, setHasSavedPlan] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);

  const guideRef = useRef<HTMLDivElement | null>(null);
  const setupRef = useRef<HTMLDivElement | null>(null);

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
    // Set by the mount effect above (URL ?date= or today+3). Firing earlier
    // would ask /api/trip for an empty date and 400.
    if (!departureDate) return;
    fetch("/api/trip" + tripQuery)
      .then((r) => r.json())
      .then((d: TripData) => {
        setData(d);
        if (d?.trip?.days?.[1]?.label) {
          setSelectedDayLabel(d.trip.days[1].label);
        } else if (d?.trip?.days?.[0]?.label) {
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
          // Otherwise default to today + 3 so a fresh visitor always lands on a
          // trip that has a "today". An explicit ?date= still wins above.
          else setDepartureDate(defaultDepartureDate());
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
        else if (menuOpen) setMenuOpen(false);
        else if (run.phase === "running") cancelShift();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [run.phase, startShift, cancelShift, agentDrawerOpen, menuOpen]);

  const goGuide = () => {
    setActiveScreen("guide");
    guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const goSetup = () => {
    setActiveScreen("setup");
    setupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const providerFallback = run.errors.length > 0;
  const baseline = run.baseline ?? data?.baseline;
  const rawCalendar = run.calendar.length > 0 ? run.calendar : (data?.calendar ?? []);
  const currentEvents = run.calendar.length > 0 ? calendarWithMoves(run) : rawCalendar;
  const currentReadiness = trip
    ? meetingReadiness(trip, currentEvents, [...run.locked.values()], baseline)
    : [];
  const activeCitations = run.citations;
  // Latest graph-memory consult this run — hop path into nudge evidence rows.
  let memoryPath: string | undefined;
  for (let i = run.log.length - 1; i >= 0; i--) {
    const e = run.log[i].event;
    if (e.type === "tool_result" && MEMORY_TOOL_NAMES.has(e.tool)) {
      const m = e.detail.match(/[\w:()]+ *-\[:[^\]]+\]-> *.+/);
      memoryPath = (m ? m[0] : e.detail).slice(0, 140);
      break;
    }
  }

  // Depth dial via URL: ?depth=guided opens every evidence drawer;
  // ?depth=operator goes straight to the crew surface. Deferred so the first
  // paint isn't blocked reading location.
  const [depth, setDepth] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = q.get("depth");
    if (d === "operator") {
      window.location.replace("/crew");
      return;
    }
    const t = setTimeout(() => {
      setDepth(d);
      if (q.get("screen") === "setup") {
        setActiveScreen("setup");
        setupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="root" ref={menuRef}>
      <div className="beam" />
      <div className="in">
        {/* Top Sunlit Horizon Navigation */}
        <div className="nav rise">
          <button type="button" className="brand" onClick={goGuide}>
            <b>MERIDIAN</b>
            <span>Land at 100%</span>
          </button>

          <div className="pill" role="navigation" aria-label="Primary screens">
            <a
              tabIndex={0}
              className={activeScreen === "guide" ? "on" : ""}
              onClick={goGuide}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  goGuide();
                }
              }}
            >
              Daily Guide
            </a>
            <a
              tabIndex={0}
              className={activeScreen === "setup" ? "on" : ""}
              onClick={goSetup}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  goSetup();
                }
              }}
            >
              Trip Setup
            </a>
            <Link href="/crew">Crew</Link>
          </div>

          <div className="right">
            <button
              type="button"
              className="btn"
              onClick={() => {
                voiceOnRef.current = true;
                setVoiceOn(true);
                setVoiceEnabled(true);
              }}
              aria-pressed={voiceOn}
            >
              Voice
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                voiceOnRef.current = false;
                setVoiceOn(false);
                setVoiceEnabled(false);
                stopVoice();
              }}
              aria-pressed={!voiceOn}
            >
              Muted
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              Menu
            </button>
          </div>
        </div>

        {/* Dropdown Menu */}
        {menuOpen && (
          <div className="menu rise" style={{ animationDelay: ".1s" }} role="menu">
            <div
              role="menuitem"
              tabIndex={0}
              onClick={() => {
                goGuide();
                setMenuOpen(false);
              }}
            >
              Daily Guide (Nudges)
            </div>
            <div
              role="menuitem"
              tabIndex={0}
              onClick={() => {
                goSetup();
                setMenuOpen(false);
              }}
            >
              Trip &amp; Flight Setup
            </div>
            {hasSavedPlan ? (
              <Link href="/review" className="m" onClick={() => setMenuOpen(false)}>
                Printable guide →
              </Link>
            ) : (
              <Link href="/review" className="m" onClick={() => setMenuOpen(false)}>
                Printable guide →
              </Link>
            )}
            <Link href="/history" className="m" onClick={() => setMenuOpen(false)}>
              Past trips{runCount > 0 ? ` (${runCount})` : ""}
            </Link>
            <Link href="/outcome" className="m" onClick={() => setMenuOpen(false)}>
              Log sleep outcome
            </Link>
            <Link href="/crew" className="m" onClick={() => setMenuOpen(false)}>
              See the crew work →
            </Link>
            {run.briefing && (
              <button
                type="button"
                className="m"
                style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                onClick={async () => {
                  const r = await fetch("/api/share", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ briefing: run.briefing, trip }),
                  });
                  const { url } = await r.json();
                  const full = `${window.location.origin}${url}`;
                  try { await navigator.clipboard.writeText(full); } catch { /* clipboard optional */ }
                  setMenuOpen(false);
                  window.open(url, "_blank");
                }}
              >
                Share plan link →
              </button>
            )}
            <div
              role="menuitem"
              tabIndex={0}
              className="m"
              onClick={() => {
                setMenuOpen(false);
                setAgentDrawerOpen(true);
              }}
            >
              Behind the scenes (AI)
            </div>
          </div>
        )}

        {/* Titlebar Header */}
        <div
          className="titlebar rise"
          style={{ animationDelay: ".1s", marginTop: "70px" }}
        >
          <div>
            <h1>Trip &amp; Flight Setup</h1>
            <p>
              Choose your route, pick the best flight window for zero jet lag,
              and manage your wearable &amp; calendar sync.
            </p>
          </div>
          <button type="button" className="p1" onClick={goGuide}>
            Back to Daily Nudges
          </button>
        </div>

        {run.briefing && !briefingDismissed && (
          <div style={{ marginBottom: "18px" }}>
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
          </div>
        )}

        {/* Daily Guide: Split-Horizon Hero + Bento Deck */}
        <div ref={guideRef}>
          <NudgeFeedScreen
            trip={trip}
            phase={run.phase}
            selectedDayLabel={selectedDayLabel}
            onSelectDay={setSelectedDayLabel}
            locked={run.locked}
            drafts={run.drafts}
            verdicts={run.verdicts}
            rejected={run.rejected}
            memoryPath={memoryPath}
            expandAllWhy={depth === "guided"}
            baseline={baseline}
            calendarEvents={currentEvents}
            moves={run.moves}
            citations={activeCitations}
            ics={run.briefing?.ics}
            selectedFlightId={selectedFlightId}
            onOpenTripSetup={goSetup}
            onStartCrewSync={startShift}
            onCheckIn={(status) => beginStream({ checkins: status })}
          />
        </div>

        {/* Bottom-Sheet Flight Advisor + Route/Wearable + Deep-Dive Visuals */}
        <div ref={setupRef}>
          <TripSetupScreen
            trip={trip}
            origin={origin}
            dest={dest}
            departureDate={departureDate}
            baselineSource={data?.baselineSource}
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
            onBackToGuide={goGuide}
          />
        </div>
      </div>

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
