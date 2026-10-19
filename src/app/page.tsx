"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import { todayDayIndex } from "@/domain/today";
import { resolveBaseline, type WakeBand } from "@/domain/fixtures";
import { getFlightRecommendations } from "@/domain/nudges";
import { summarizeCheckIn } from "@/domain/adherence";
import type {
  AdherenceProfile,
  CheckIn,
  CheckInRequest,
  BaselineKind,
  CalendarEvent,
  Citation,
  CrewEvent,
  DayPlan,
  Trip,
  WearableBaseline,
} from "@/domain/types";
import { type LogEntry } from "@/components/CrewFeed";
import { MeridianDailyScreen } from "@/components/dial/MeridianDailyScreen";
import { NudgeFeedScreen } from "@/components/NudgeFeedScreen";
import { HandoffBanner } from "@/components/HandoffBanner";
import { RunAnnouncer } from "@/components/RunAnnouncer";
import { JourneySteps } from "@/components/JourneySteps";
import { useFocusTrap } from "@/lib/a11y";
import { friendlyDayLabel } from "@/lib/day-label";
import { restorePlan } from "@/lib/restore-plan";
import { syncFeed } from "@/lib/feed";
import { useAssistantLink } from "@/lib/use-assistant-link";
import { useFeedStale } from "@/lib/use-feed-health";
import { useInstallPrompt } from "@/lib/use-install-prompt";
import { useReminders } from "@/lib/use-reminders";
import { useTheme } from "@/lib/use-theme";
import { isTripFinished } from "@/lib/trip-status";
import { useRunState, calendarWithMoves, ledgerEvents, ghostGapDeg } from "@/state/run";
import { meetingReadiness } from "@/domain/readiness";
import {
  initVoice,
  stopAll as stopVoiceAll,
  subscribeVoiceErrors,
} from "@/lib/voice/engine";

const RoutePicker = dynamic(
  () => import("@/components/RoutePicker").then((m) => m.RoutePicker),
  { loading: () => <div style={{ minHeight: 44 }} aria-hidden="true" /> },
);
const DeepDiveVisuals = dynamic(
  () => import("@/components/DeepDiveVisuals").then((m) => m.DeepDiveVisuals),
);
const TripSetupScreen = dynamic(
  () => import("@/components/TripSetupScreen").then((m) => m.TripSetupScreen),
);
const AgentDrawer = dynamic(
  () => import("@/components/AgentDrawer").then((m) => m.AgentDrawer),
);

interface TripData {
  trip: Trip;
  baseline: WearableBaseline;
  baselineSource?: "fixture" | "garmin";
  baselineKind?: BaselineKind;
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

/** The day Home should open on: today when the trip spans it, else the first
 *  pre-flight day, else the first day. */
function pickHomeDayLabel(trip: Trip): string | null {
  const todayIdx = todayDayIndex(trip, new Date());
  const spec =
    (todayIdx !== null ? trip.days.find((x) => x.dayIndex === todayIdx) : undefined) ??
    trip.days[1] ??
    trip.days[0];
  return spec?.label ?? null;
}

/** Consumer default departure: three days out, in the viewer's local date. */
function defaultDepartureDate(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const DEPTH_KEY = "meridian:depth";
const VIEW_KEY = "meridian:homeView";

const EMPTY_LOCKED: Map<string, DayPlan> = new Map();

const MEMORY_TOOL_NAMES = new Set([
  "recallFindings",
  "priorFailures",
  "calendarConflicts",
  "crewMemory",
  "recall_findings",
  "crew_memory",
]);

export default function Home() {
  /** Primary Home Experience Toggle: 24h Dial + Mascot vs Daily Timeline + Dawn Globe */
  const [homeView, setHomeView] = useState<"dial" | "timeline">("dial");
  const [appMode, setAppMode] = useState<"TRIP" | "SHIFT">("TRIP");
  const [setupOpen, setSetupOpen] = useState(false);
  const [origin, setOrigin] = useState("LHR");
  const [dest, setDest] = useState("HND");
  const [departureDate, setDepartureDate] = useState("");
  const [flightChoice, setFlightChoice] = useState<string | null>(null);
  const [checkInsParam, setCheckInsParam] = useState("");
  const [startDayParam, setStartDayParam] = useState(0);
  const { run, dispatch, reset } = useRunState();
  const [data, setData] = useState<TripData | null>(null);
  const [wakeBand, setWakeBand] = useState<WakeBand | null>(null);
  const [tripResolved, setTripResolved] = useState(false);
  const [selectedDayLabel, setSelectedDayLabel] = useState<string>("D-1");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const lastEventAt = useRef(0);
  const briefingSeen = useRef(false);
  const runTripRef = useRef<Trip | null>(null);

  const STALL_IDLE_MS = 60_000;
  const STALL_AFTER_BRIEFING_MS = 12_000;
  const [hasSavedPlan, setHasSavedPlan] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [pastRuns, setPastRuns] = useState<
    { savedAt: string; trip?: { origin?: { code?: string }; destination?: { code?: string }; requiredShiftMin?: number; direction?: "east" | "west" } | null; score: number }[]
  >([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);
  const [drawerUsed, setDrawerUsed] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [bookingText, setBookingText] = useState("");
  const [bookingError, setBookingError] = useState(false);
  const assistant = useAssistantLink();
  const install = useInstallPrompt();
  const feedStale = useFeedStale();
  const { theme, cycleTheme } = useTheme();
  const [restoredLocked, setRestoredLocked] = useState<Map<string, DayPlan> | null>(null);
  const [restoredCitations, setRestoredCitations] = useState<Citation[]>([]);

  const guideRef = useRef<HTMLDivElement | null>(null);
  const setupRef = useRef<HTMLDivElement | null>(null);

  const trip = (run.trip ?? data?.trip ?? null) as Trip | null;

  const recommendedFlightId = trip
    ? (getFlightRecommendations(trip).find((f) => f.recommended)?.id ?? null)
    : null;
  const selectedFlightId = flightChoice ?? recommendedFlightId;
  const tripQuery =
    `?origin=${origin}&dest=${dest}&date=${departureDate}` +
    (selectedFlightId ? `&flight=${selectedFlightId}` : "");

  const esRef = useRef<EventSource | null>(null);
  const [voiceAvail, setVoiceAvail] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const setupPanelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(setupPanelRef, setupOpen);

  const stopVoice = useCallback(() => {
    stopVoiceAll();
  }, []);

  useEffect(() => {
    if (!departureDate) return;
    fetch("/api/trip" + tripQuery)
      .then((r) => r.json())
      .then((d: TripData) => {
        setTripResolved(true);
        setData(d);
        const label = d?.trip ? pickHomeDayLabel(d.trip) : null;
        if (label) setSelectedDayLabel(label);
      })
      .catch(() => setTripResolved(true));
  }, [tripQuery, departureDate]);

  const hook = trip
    ? { body: clockAt(trip.origin.utcOffsetMin), dest: clockAt(trip.destination.utcOffsetMin) }
    : null;

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        initVoice().then(setVoiceAvail);
        setHasSavedPlan(Boolean(localStorage.getItem("meridian:lastPlan")));
        const savedView = localStorage.getItem(VIEW_KEY);
        if (savedView === "dial" || savedView === "timeline") {
          setHomeView(savedView);
        }
        fetch("/api/memory")
          .then((r) => r.json())
          .then((d) => setRunCount(Array.isArray(d?.runs) ? d.runs.length : 0))
          .catch(() => {});
        fetch("/api/persistence/runs")
          .then((r) => r.json())
          .then((d) => {
            if (d?.enabled && Array.isArray(d.runs)) setPastRuns(d.runs);
          })
          .catch(() => {});
        if (typeof window !== "undefined") {
          const sp = new URLSearchParams(window.location.search);
          if (sp.get("origin")) setOrigin(sp.get("origin")!);
          if (sp.get("dest")) setDest(sp.get("dest")!);
          if (sp.get("view") === "timeline" || sp.get("view") === "dial") {
            setHomeView(sp.get("view") as "dial" | "timeline");
          }
          const qDate = sp.get("date");
          setDepartureDate(
            qDate && isValidDate(qDate) ? qDate : defaultDepartureDate(),
          );
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
          runTripRef.current = e.trip;
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
                coverage: e.coverage,
                savedAt: new Date().toISOString(),
              }),
            );
            if (e.ics && runTripRef.current && e.days) {
              syncFeed({ ics: e.ics, trip: runTripRef.current, days: e.days });
            }
            if ((e.days?.length ?? 0) > 0) {
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
            }
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
          setStreamError(null);
          esRef.current?.close();
          {
            const t = runTripRef.current ?? data?.trip;
            const label = t ? pickHomeDayLabel(t) : null;
            if (label) setSelectedDayLabel(label);
          }
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
      esRef.current?.close();
      reset();
      setEntries([]);
      setBriefingDismissed(false);
      setStreamError(null);
      const params = new URLSearchParams(tripQuery.replace(/^\?/, ""));
      if (wakeBand) params.set("wake", wakeBand);
      if (extra?.checkins) params.set("checkins", extra.checkins);
      else if (checkInsParam) params.set("checkins", checkInsParam);
      if (extra?.startDay !== undefined) params.set("startDay", String(extra.startDay));
      else if (startDayParam) params.set("startDay", String(startDayParam));
      if (selectedFlightId) params.set("flight", selectedFlightId);
      const es = new EventSource("/api/crew/run?" + params.toString());
      esRef.current = es;
      lastEventAt.current = Date.now();
      briefingSeen.current = false;
      es.onmessage = (m) => {
        lastEventAt.current = Date.now();
        const evt = JSON.parse(m.data) as CrewEvent;
        if (evt.type === "briefing") briefingSeen.current = true;
        dispatch(evt);
        handleSideEffects(evt);
      };
      es.onerror = () => {
        push({ kind: "error", text: "stream interrupted" });
        es.close();
        setStreamError(
          "The crew's connection dropped mid-run. Days already verified are kept — run it again when you're ready.",
        );
        reset();
      };
    },
    [dispatch, handleSideEffects, push, reset, run.phase, tripQuery, checkInsParam, startDayParam, wakeBand, selectedFlightId],
  );

  const startShift = useCallback(() => beginStream(), [beginStream]);

  const persistCheckIns = useCallback((checkIns: CheckIn[]) => {
    for (const c of checkIns) {
      const body: CheckInRequest = {
        dayIndex: c.dayIndex,
        kind: c.kind,
        startMin: c.startMin,
        status: c.status,
        text: c.text,
      };
      fetch("/api/crew/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    }
  }, []);

  const sendDayCheckIn = useCallback(
    (checkIns: CheckIn[], lastMarkedDayIndex: number) => {
      if (!trip || !checkIns.length) return;
      persistCheckIns(checkIns);
      beginStream({
        checkins: btoa(JSON.stringify(checkIns)),
        startDay: Math.min(lastMarkedDayIndex + 1, Math.max(trip.days.length - 1, 0)),
      });
    },
    [trip, beginStream, persistCheckIns],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        if (assistant.open) assistant.closeSheet();
        else if (setupOpen) setSetupOpen(false);
        else if (agentDrawerOpen) setAgentDrawerOpen(false);
        else if (menuOpen) setMenuOpen(false);
        else if (run.phase === "running") cancelShift();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [run.phase, cancelShift, agentDrawerOpen, menuOpen, setupOpen, assistant]);

  useEffect(() => {
    if (run.phase !== "running") return;
    const id = setInterval(() => {
      const silent = Date.now() - lastEventAt.current;
      if (silent < (briefingSeen.current ? STALL_AFTER_BRIEFING_MS : STALL_IDLE_MS)) return;
      esRef.current?.close();
      setStreamError(
        briefingSeen.current
          ? "The crew delivered a plan but the run never finished — anything already verified is kept. Run it again to finish."
          : "The crew stopped responding mid-run. Anything already verified is kept — run it again when you're ready.",
      );
      reset();
    }, 4000);
    return () => clearInterval(id);
  }, [run.phase, reset]);

  const goGuide = () => {
    guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openSetup = () => setSetupOpen(true);
  const closeSetup = () => setSetupOpen(false);

  const chooseHomeView = (next: "dial" | "timeline") => {
    setHomeView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const r = restorePlan(
          localStorage.getItem("meridian:lastPlan"),
          localStorage.getItem("meridian:lastTrip"),
          { origin, dest, date: departureDate },
        );
        setRestoredLocked(r?.locked ?? null);
        setRestoredCitations(r?.citations ?? []);
      } catch {
        setRestoredLocked(null);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [origin, dest, departureDate, run.briefing]);

  const effectiveLocked = run.locked.size ? run.locked : (restoredLocked ?? EMPTY_LOCKED);
  const effectivePhase =
    run.phase === "idle" && restoredLocked?.size ? "done" : run.phase;

  const { remindersOn, remindersBlocked, externalMark, toggleReminders } =
    useReminders({ trip, lockedDays: effectiveLocked, onMarkDay: setSelectedDayLabel });

  const providerFallback = run.errors.length > 0;
  const baseline = run.baseline ?? resolveBaseline(wakeBand, data?.baseline);
  const rawCalendar = run.calendar.length > 0 ? run.calendar : (data?.calendar ?? []);
  const currentEvents = run.calendar.length > 0 ? calendarWithMoves(run) : rawCalendar;
  const currentReadiness = trip
    ? meetingReadiness(trip, currentEvents, [...effectiveLocked.values()], baseline)
    : [];
  const activeCitations = run.citations.length ? run.citations : restoredCitations;
  let memoryPath: string | undefined;
  for (let i = run.log.length - 1; i >= 0; i--) {
    const e = run.log[i].event;
    if (e.type === "tool_result" && MEMORY_TOOL_NAMES.has(e.tool)) {
      const m = e.detail.match(/[\w:()]+ *-\[:[^\]]+\]-> *.+/);
      memoryPath = (m ? m[0] : e.detail).slice(0, 140);
      break;
    }
  }

  const [depth, setDepth] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const d = q.get("depth");
    if (d === "operator") {
      window.location.replace("/crew");
      return;
    }
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(DEPTH_KEY);
    } catch {
      /* storage unavailable */
    }
    const effective = d ?? (saved === "guided" ? "guided" : null);
    const t = setTimeout(() => {
      setDepth(effective);
      try {
        const savedWake = localStorage.getItem("meridian:wakeBand");
        if (savedWake === "before6" || savedWake === "6to8" || savedWake === "after8") {
          setWakeBand(savedWake);
        }
      } catch {
        /* storage unavailable */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const chooseDepth = (next: "calm" | "guided") => {
    setDepth(next === "guided" ? "guided" : null);
    const url = new URL(window.location.href);
    if (next === "guided") url.searchParams.set("depth", "guided");
    else url.searchParams.delete("depth");
    window.history.replaceState(null, "", url.toString());
    try {
      localStorage.setItem(DEPTH_KEY, next);
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div className="root" ref={menuRef}>
      <div className="beam" />
      <div className="dawnIn" aria-hidden="true" />
      <div className="in">
        <RunAnnouncer run={run} />

        {/* Unified Sunlit Horizon Top Bar */}
        <div className="nav rise">
          <button type="button" className="brand" onClick={goGuide}>
            <b>MERIDIAN</b>
            <span>24h Body-Clock Planner</span>
          </button>

          {/* Primary Experience Toggle: 24h Dial vs Timeline */}
          <div className="pill" role="group" aria-label="Primary view toggle">
            <button
              type="button"
              className={homeView === "dial" ? "on" : undefined}
              aria-pressed={homeView === "dial"}
              onClick={() => chooseHomeView("dial")}
              data-testid="toggle-view-dial"
            >
              ◎ 24h Dial
            </button>
            <button
              type="button"
              className={homeView === "timeline" ? "on" : undefined}
              aria-pressed={homeView === "timeline"}
              onClick={() => chooseHomeView("timeline")}
              data-testid="toggle-view-timeline"
            >
              ☰ Timeline
            </button>
          </div>

          {/* Mode Switcher when on 24h Dial: TRIP vs SHIFT */}
          {homeView === "dial" && (
            <div className="pill" role="group" aria-label="Planning mode">
              <button
                type="button"
                className={appMode === "TRIP" ? "on" : undefined}
                aria-pressed={appMode === "TRIP"}
                onClick={() => setAppMode("TRIP")}
              >
                ✈️ TRIP
              </button>
              <button
                type="button"
                className={appMode === "SHIFT" ? "on" : undefined}
                aria-pressed={appMode === "SHIFT"}
                onClick={() => setAppMode("SHIFT")}
              >
                🏥 SHIFT
              </button>
            </div>
          )}

          <div className="right">
            {/* Recommended Depth Switcher: Calm / Guided / Operator */}
            <div
              className="pill depth"
              role="group"
              aria-label="Depth dial: Calm, Guided, Operator"
            >
              <button
                type="button"
                className={depth !== "guided" ? "on" : undefined}
                aria-pressed={depth !== "guided"}
                onClick={() => chooseDepth("calm")}
                title="Calm view: action & dial/timeline first, evidence on tap"
              >
                Calm
              </button>
              <button
                type="button"
                className={depth === "guided" ? "on" : undefined}
                aria-pressed={depth === "guided"}
                onClick={() => chooseDepth("guided")}
                title="Guided view: auto-expands evidence, provenance & deep-dive visuals"
              >
                Guided
              </button>
              <Link
                href="/crew"
                title="Operator view: 4-lens crew & deterministic solver trace"
              >
                Operator ↗
              </Link>
            </div>

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
            <button
              type="button"
              className="m"
              role="menuitem"
              onClick={() => {
                openSetup();
                setMenuOpen(false);
              }}
            >
              Trip settings
            </button>
            {hasSavedPlan && (
              <Link href="/review" className="m" role="menuitem" onClick={() => setMenuOpen(false)}>
                Saved plan
              </Link>
            )}
            <Link href="/history" className="m" role="menuitem" onClick={() => setMenuOpen(false)}>
              Past trips{runCount > 0 ? ` (${runCount})` : ""}
            </Link>
            <Link
              href="/outcome"
              className="m"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              Sleep check-in
            </Link>
            <Link
              href={`/arrival?origin=${origin}&dest=${dest}&date=${departureDate}`}
              className="m"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
            >
              Rate my trip
            </Link>
            {run.briefing && (
              <button
                type="button"
                className="m"
                onClick={async () => {
                  const { heroMeeting } = await import("@/domain/hero");
                  const heroMtg = trip
                    ? heroMeeting({
                        trip,
                        calendar: currentEvents,
                        locked: [...effectiveLocked.values()].map((d) => ({ shiftMin: d.shiftMin })),
                        baseline,
                      })
                    : null;
                  const r = await fetch("/api/share", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      briefing: run.briefing,
                      trip: trip
                        ? {
                            origin: { name: trip.origin.name },
                            destination: { name: trip.destination.name },
                            requiredShiftMin: trip.requiredShiftMin,
                            direction: trip.direction,
                            heroMeeting: heroMtg
                              ? {
                                  title: heroMtg.title,
                                  localMin: heroMtg.localMin,
                                  bodyMin: heroMtg.bodyMin,
                                  bodyWithoutPlanMin: heroMtg.bodyWithoutPlanMin,
                                }
                              : null,
                          }
                        : null,
                    }),
                  });
                  const { url } = await r.json();
                  const full = `${window.location.origin}${url}`;
                  try { await navigator.clipboard.writeText(full); } catch { /* clipboard optional */ }
                  setMenuOpen(false);
                  window.open(url, "_blank");
                }}
              >
                Share plan →
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="m"
              onClick={() => {
                setMenuOpen(false);
                setDrawerUsed(true);
                setAgentDrawerOpen(true);
              }}
            >
              Activity log
            </button>
            <button
              type="button"
              className="m"
              role="menuitem"
              onClick={cycleTheme}
            >
              Appearance: {theme === "auto" ? "Auto" : theme === "light" ? "Light" : "Dark"}
            </button>
            {(() => {
              const standalone =
                typeof window !== "undefined" &&
                (window.matchMedia?.("(display-mode: standalone)").matches ||
                  (navigator as { standalone?: boolean }).standalone);
              const iOS =
                typeof window !== "undefined" &&
                /iP(hone|ad|od)/.test(navigator.userAgent);
              if (standalone) return null;
              if (!install.installEvt && !iOS) return null;
              return (
                <button
                  type="button"
                  className="m"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    install.promptInstall();
                  }}
                >
                  Install app
                </button>
              );
            })()}
            {hasSavedPlan && (
              <button
                type="button"
                className="m"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void assistant.openSheet();
                }}
              >
                Voice assistant
              </button>
            )}
            <div style={{ padding: "8px 12px 4px", fontSize: "11px", color: "var(--m-muted)" }}>
              Timing guidance, not medical advice.
            </div>
          </div>
        )}

        {streamError && (
          <div className="run-error" role="alert">
            <span>{streamError}</span>
            <button type="button" onClick={() => setStreamError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {run.briefing && !briefingDismissed && (
          <div style={{ marginBottom: "18px" }}>
            <HandoffBanner
              trip={trip}
              summary={run.briefing.summary}
              score={run.briefing.score}
              citations={run.briefing.citations}
              days={run.briefing.days}
              ics={run.briefing.ics}
              lines={run.briefing.lines}
              coverage={run.briefing.coverage}
              fallback={providerFallback}
              voiceAvailable={voiceAvail}
              destinationName={trip?.destination.name}
              dayName={(label) => {
                const spec = trip?.days.find((d) => d.label === label);
                return spec ? friendlyDayLabel(spec, trip?.departureDayIndex) : label;
              }}
              onDismiss={() => setBriefingDismissed(true)}
            />
          </div>
        )}

        {trip ? (
          <>
            {/* Compact Trip Summary Chip + Inline Route/Booking Editor */}
            <div ref={setupRef} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="trip-chip"
                  onClick={() => setRouteOpen((v) => !v)}
                  aria-expanded={routeOpen}
                >
                  {trip.origin.name} ({trip.origin.code}) → {trip.destination.name} ({trip.destination.code}) ·{" "}
                  {trip.days.find((d) => d.dayIndex === trip.departureDayIndex)?.date
                    ? new Date(`${trip.days.find((d) => d.dayIndex === trip.departureDayIndex)!.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
                    : departureDate}{" "}
                  · {trip.destination.name} is {Math.abs(trip.requiredShiftMin / 60)}h{" "}
                  {trip.direction === "east" ? "ahead" : "behind"}{" "}
                  <span className="trip-chip-change">✎ Change route</span>
                </button>

                {effectiveLocked.size > 0 && (
                  <JourneySteps
                    current={
                      isTripFinished(trip, new Date())
                        ? 3
                        : 2
                    }
                  />
                )}
              </div>

              {routeOpen && (
                <div style={{ marginTop: 8 }}>
                  <div className="card" style={{ padding: "12px 14px", marginBottom: 10 }}>
                    <b style={{ fontSize: "12px", color: "var(--m-text)" }}>Paste your booking</b>
                    <textarea
                      value={bookingText}
                      onChange={(e) => { setBookingText(e.target.value); setBookingError(false); }}
                      rows={3}
                      placeholder="e.g. Your flight BA005 London Heathrow (LHR) to Tokyo Haneda (HND) departs Wed 21 Oct 2026"
                      style={{ width: "100%", marginTop: 6, padding: 8, fontSize: 13, borderRadius: 8, border: "1px solid var(--m-border)", font: "inherit" }}
                    />
                    <button
                      type="button"
                      className="chip"
                      style={{ marginTop: 6, minHeight: 44 }}
                      onClick={async () => {
                        const { parseBooking } = await import("@/lib/booking");
                        const r = parseBooking(bookingText, new Date());
                        if (!r) {
                          setBookingError(true);
                          return;
                        }
                        setOrigin(r.origin);
                        setDest(r.dest);
                        setDepartureDate(r.date);
                        setFlightChoice(null);
                        setRouteOpen(false);
                        reset();
                      }}
                    >
                      Use these details
                    </button>
                    {bookingError && (
                      <p role="alert" style={{ margin: "6px 0 0", fontSize: 12, color: "#b04523" }}>
                        Couldn&apos;t find both airports and a date — make sure the text includes the airport codes (like LHR) and the flight date.
                      </p>
                    )}
                  </div>
                  <RoutePicker
                    origin={origin}
                    dest={dest}
                    date={departureDate}
                    surface="cream"
                    onChange={(next) => {
                      setOrigin(next.origin);
                      setDest(next.dest);
                      setDepartureDate(next.date);
                      setFlightChoice(null);
                      setRouteOpen(false);
                      reset();
                    }}
                  />
                </div>
              )}
            </div>

            <div ref={guideRef}>
              {homeView === "dial" ? (
                <MeridianDailyScreen
                  mode={appMode}
                  onChangeMode={setAppMode}
                  trip={trip}
                  phase={effectivePhase}
                  selectedDayLabel={selectedDayLabel}
                  onSelectDay={setSelectedDayLabel}
                  locked={effectiveLocked}
                  drafts={run.drafts}
                  verdicts={run.verdicts}
                  baseline={baseline}
                  calendarEvents={currentEvents}
                  moves={run.moves}
                  citations={activeCitations}
                  onOpenTripSetup={openSetup}
                  onStartCrewSync={startShift}
                  depth={depth}
                  memoryPath={memoryPath}
                />
              ) : (
                <>
                  <NudgeFeedScreen
                    trip={trip}
                    phase={effectivePhase}
                    selectedDayLabel={selectedDayLabel}
                    onSelectDay={setSelectedDayLabel}
                    locked={effectiveLocked}
                    drafts={run.drafts}
                    verdicts={run.verdicts}
                    rejected={run.rejected}
                    memoryPath={memoryPath}
                    expandAllWhy={depth === "guided"}
                    baseline={baseline}
                    calendarEvents={currentEvents}
                    moves={run.moves}
                    citations={activeCitations}
                    adherence={data?.adherence}
                    baselineSource={data?.baselineSource}
                    baselineKind={data?.baselineKind}
                    wakeBand={wakeBand}
                    onWakeBand={(b) => {
                      setWakeBand(b);
                      if (b) localStorage.setItem("meridian:wakeBand", b);
                      else localStorage.removeItem("meridian:wakeBand");
                    }}
                    onStartCrewSync={startShift}
                    onCheckIn={sendDayCheckIn}
                    externalMark={externalMark}
                    remindersOn={remindersOn}
                    onToggleReminders={toggleReminders}
                    remindersBlocked={remindersBlocked}
                    feedStale={feedStale}
                    onCancelRun={cancelShift}
                    runActiveAgent={run.activeAgent}
                    pastRuns={pastRuns}
                  />

                  {depth === "guided" && (
                    <DeepDiveVisuals
                      trip={trip}
                      phase={effectivePhase}
                      sunProgress={run.sunProgress}
                      ghostGap={ghostGapDeg(run)}
                      locked={effectiveLocked}
                      drafts={run.drafts}
                      verdicts={run.verdicts}
                      calendar={currentEvents}
                      readiness={currentReadiness}
                      citations={activeCitations}
                      activeLabel={run.activeLabel}
                      activeAgent={run.activeAgent}
                      ics={run.briefing?.ics}
                    />
                  )}
                </>
              )}
            </div>
          </>
        ) : !tripResolved ? (
          <div ref={setupRef} aria-busy="true" aria-label="Loading your plan" style={{ padding: "24px 0" }}>
            <span className="sr-only">Loading your plan…</span>
            <div className="skel" style={{ width: "60%", height: 44, borderRadius: 999 }} />
            <div className="skel card" style={{ marginTop: 18, padding: 20 }}>
              <div className="skel" style={{ width: "40%", height: 14, borderRadius: 6 }} />
              <div className="skel" style={{ width: "80%", height: 20, borderRadius: 6, marginTop: 12 }} />
              <div className="skel" style={{ width: "65%", height: 14, borderRadius: 6, marginTop: 8 }} />
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <div className="skel" style={{ width: 120, height: 44, borderRadius: 999 }} />
                <div className="skel" style={{ width: 90, height: 44, borderRadius: 999 }} />
              </div>
            </div>
            <div className="skel" style={{ width: "100%", height: 44, borderRadius: 999, marginTop: 22 }} />
          </div>
        ) : (
          <div ref={setupRef}>
            <TripSetupScreen
              trip={trip}
              origin={origin}
              dest={dest}
              departureDate={departureDate}
              baselineSource={data?.baselineSource}
              baselineKind={data?.baselineKind}
              wakeBand={wakeBand}
              onWakeBand={(b) => {
                setWakeBand(b);
                if (b) localStorage.setItem("meridian:wakeBand", b);
                else localStorage.removeItem("meridian:wakeBand");
              }}
              onChangeRoute={(next) => {
                setOrigin(next.origin);
                setDest(next.dest);
                setDepartureDate(next.date);
                setFlightChoice(null);
                reset();
              }}
              selectedFlightId={selectedFlightId}
              onSelectFlightId={setFlightChoice}
              baseline={baseline}
              calendar={currentEvents}
              calendarSource={data?.calendarSource}
              readiness={currentReadiness}
              hook={hook}
              phase={run.phase}
              lockedCount={run.locked.size}
              totalDays={data?.trip?.days.length ?? 5}
              sessionStartedAt={run.sessionStartedAt}
              onStart={startShift}
              onCancel={cancelShift}
              onBackToGuide={goGuide}
            />
          </div>
        )}

        {/* Trip settings modal sheet */}
        {setupOpen && trip && (
          <div
            className="sheet-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Trip settings"
            onClick={closeSetup}
          >
            <div className="sheet-panel" ref={setupPanelRef} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="sheet-close"
                onClick={closeSetup}
                aria-label="Close"
              >
                ×
              </button>
              <TripSetupScreen
                variant="sheet"
                trip={trip}
                origin={origin}
                dest={dest}
                departureDate={departureDate}
                baselineSource={data?.baselineSource}
                baselineKind={data?.baselineKind}
                wakeBand={wakeBand}
                onWakeBand={(b) => {
                  setWakeBand(b);
                  if (b) localStorage.setItem("meridian:wakeBand", b);
                  else localStorage.removeItem("meridian:wakeBand");
                }}
                onChangeRoute={(next) => {
                  setOrigin(next.origin);
                  setDest(next.dest);
                  setDepartureDate(next.date);
                  reset();
                }}
                selectedFlightId={selectedFlightId}
                onSelectFlightId={setFlightChoice}
                baseline={baseline}
                calendar={currentEvents}
                calendarSource={data?.calendarSource}
                readiness={currentReadiness}
                hook={hook}
                phase={run.phase}
                lockedCount={run.locked.size}
                totalDays={trip.days.length}
                sessionStartedAt={run.sessionStartedAt}
                onStart={startShift}
                onCancel={cancelShift}
                onBackToGuide={closeSetup}
              />
            </div>
          </div>
        )}

        {assistant.open && (
          <div
            className="sheet-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Voice assistant"
            onClick={assistant.closeSheet}
          >
            <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="sheet-close"
                onClick={assistant.closeSheet}
                aria-label="Close"
              >
                ×
              </button>
              <h2 className="sheet-title">Ask your assistant for the next step</h2>
              {assistant.busy && <p style={{ fontSize: 12, color: "#a89383" }}>Making your link…</p>}
              {assistant.url ? (
                <>
                  <p style={{ fontSize: 12, color: "#e8ded2", wordBreak: "break-all", fontFamily: "monospace" }}>
                    {assistant.url}
                  </p>
                  <button
                    type="button"
                    className="chip"
                    style={{ minHeight: 44 }}
                    onClick={() => void navigator.clipboard?.writeText(assistant.url!)}
                  >
                    Copy link
                  </button>
                  <button
                    type="button"
                    className="chip"
                    style={{ minHeight: 44 }}
                    onClick={() => void assistant.resetLink()}
                  >
                    Reset link
                  </button>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#a89383" }}>
                    Works with Siri Shortcuts on iPhone — or any assistant that can fetch a link.
                  </p>
                  <ol style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, color: "#e8ded2", lineHeight: 1.7 }}>
                    <li>Open the Shortcuts app and tap +.</li>
                    <li>Add &quot;Get contents of URL&quot; and paste the link.</li>
                    <li>Add &quot;Speak text&quot;.</li>
                    <li>Name it &quot;Next Meridian step&quot; — then say &quot;Hey Siri, next Meridian step&quot;.</li>
                  </ol>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: "#a89383" }}>
                    On Android or elsewhere, opening the link reads your next step aloud — no app needed.
                  </p>
                  <p style={{ margin: "10px 0 0", fontSize: 11, color: "#a89383" }}>
                    Anyone with this link can hear your next step — reset it if it gets shared.
                  </p>
                </>
              ) : (
                !assistant.busy && (
                  <p style={{ fontSize: 12, color: "#a89383" }}>
                    Couldn&apos;t make a link yet — save a plan first.
                  </p>
                )
              )}
            </div>
          </div>
        )}

        {install.showInstallTip && (
          <div
            className="sheet-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Install app"
            onClick={() => install.setShowInstallTip(false)}
          >
            <div className="sheet-panel" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="sheet-close"
                onClick={() => install.setShowInstallTip(false)}
                aria-label="Close"
              >
                ×
              </button>
              <h2 className="sheet-title">Install app</h2>
              <p style={{ fontSize: 13, color: "#e8ded2" }}>
                Tap Share, then &quot;Add to Home Screen&quot;.
              </p>
            </div>
          </div>
        )}
      </div>

      {drawerUsed && (
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
      )}
    </div>
  );
}
