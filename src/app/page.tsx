"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import { todayDayIndex } from "@/domain/today";
import { resolveBaseline, buildTrip, calendarFor, GARMIN_BASELINE, type WakeBand } from "@/domain/fixtures";
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
import { NudgeFeedScreen } from "@/components/NudgeFeedScreen";
import { BodyClockDetails } from "@/components/dial/BodyClockDetails";
import { DisclosureSheet } from "@/components/dial/DisclosureSheet";
import { BottomNav } from "@/components/BottomNav";
import dynamic from "next/dynamic";
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
const TripEntryScreen = dynamic(
  () => import("@/components/TripEntryScreen").then((m) => m.TripEntryScreen),
);
import { HandoffBanner } from "@/components/HandoffBanner";
const AgentDrawer = dynamic(
  () => import("@/components/AgentDrawer").then((m) => m.AgentDrawer),
);
import { RunAnnouncer } from "@/components/RunAnnouncer";
import { CrewTrace } from "@/components/CrewTrace";
import { CalendarApprovalCard } from "@/components/CalendarApprovalCard";
import { CrewQuestionCard } from "@/components/CrewQuestionCard";
import { MorningCheckin } from "@/components/MorningCheckin";
import { ShiftBoard } from "@/components/lenses/ShiftBoard";
import { CREW } from "@/agents/crew";
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
import { isPreview } from "@/domain/preview";
import { isValidHomeRoute, resolveHomeEntry, type HomeEntry, type HomeRoute } from "@/lib/home-entry";
import { safeStorageGet } from "@/lib/local-data";
import { useTripActions } from "@/lib/use-trip-actions";
import { useTripTaste } from "@/lib/use-trip-taste";
import { usePlaceChoices } from "@/lib/use-place-choices";
import { shareTripContext } from "@/lib/share-trip";
import { ScenarioExperience } from "@/components/ScenarioExperience";
import type { DemoScenarioId } from "@/domain/demo-scenarios";
import { isTasteItinerary, itineraryMatchesTrip, type TasteItinerary } from "@/domain/taste";
import { JourneySteps } from "@/components/JourneySteps";
import { PinnedDayRow } from "@/components/DayStrip";
import { useRunState, calendarWithMoves, ledgerEvents, ghostGapDeg } from "@/state/run";
import { meetingReadiness } from "@/domain/readiness";
import { useOnlineStatus } from "@/lib/use-online-status";
import {
  initVoice,
  stopAll as stopVoiceAll,
  subscribeVoiceErrors,
} from "@/lib/voice/engine";

interface TripData {
  trip: Trip;
  baseline: WearableBaseline;
  /** Whether `baseline` is real wearable data or the demo fixture. Surfaced
   *  so the UI can tag demo numbers instead of passing them off as measured. */
  baselineSource?: "fixture" | "garmin";
  /** Provenance of the baseline: `garmin` (uploaded), `wake-band` (the traveller
   *  answered), `demo-default` (nothing known yet — the honest moment to ask). */
  baselineKind?: BaselineKind;
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

/** The day Home should open on: today when the trip spans it, else the first
 *  pre-flight day, else the first day. Used at fetch time and again when a
 *  run finishes — while it runs, the day pills follow the crew's locks. */
function pickHomeDayLabel(trip: Trip): string | null {
  const todayIdx = todayDayIndex(trip, new Date());
  const spec =
    (todayIdx !== null ? trip.days.find((x) => x.dayIndex === todayIdx) : undefined) ??
    trip.days[1] ??
    trip.days[0];
  return spec?.label ?? null;
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

/** Depth and voice choices persist per browser. Voice is only ever changed by
 *  the traveller's own toggle, never by the depth dial. */
const DEPTH_KEY = "meridian:depth";
// VOICE_KEY used to live here so the home page's "Hear the crew" button
// could persist preference; the toggle moved to /crew (item 16), and the
// /crew page owns its own storage key. Keep this comment in case a future
// lane reintroduces voice on the home surface.

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
  const isOnline = useOnlineStatus();
  const [setupOpen, setSetupOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [entry, setEntry] = useState<HomeEntry | null>(null);
  const [entryDraft, setEntryDraft] = useState<HomeRoute | null>(null);
  /** Null means "the window we'd recommend for this route". Deriving the
   *  default from the trip (rather than hardcoding an id) is what makes the
   *  picker correct on westbound routes, where the east ids don't exist. */
  const [flightChoice, setFlightChoice] = useState<string | null>(null);
  const [checkInsParam, setCheckInsParam] = useState("");
  const [startDayParam, setStartDayParam] = useState(0);
  const { run, dispatch, reset } = useRunState();
  const [data, setData] = useState<TripData | null>(null);
  /** Self-reported natural wake — the one personalisation question. */
  const [wakeBand, setWakeBand] = useState<WakeBand | null>(null);
  const [tripResolved, setTripResolved] = useState(false);
  const [tripFetchError, setTripFetchError] = useState(false);
  const [fetchNonce, setFetchNonce] = useState(0);
  const [selectedDayLabel, setSelectedDayLabel] = useState<string>("D-1");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  /** A crew run that died mid-stream. Rendered on the Today surface, not only
   *  in the closed-by-default AgentDrawer, because that is where the user is. */
  const [streamError, setStreamError] = useState<string | null>(null);
  /** Wall-clock of the last event on the current stream, and whether the
   *  briefing already landed. Together they let the watchdog tell "slow" from
   *  "wedged" — see the effect below. */
  const lastEventAt = useRef(0);
  const briefingSeen = useRef(false);
  /** The trip the live run is planning for — set on run_start so the done
   *  handler can re-aim the day pills without a stale render-time `trip`. */
  const runTripRef = useRef<Trip | null>(null);

  // A run can wedge without the connection ever erroring: the stream stays open
  // while the server waits on something optional. That is invisible to
  // `onerror` and it strands the user on a disabled button, so treat silence as
  // a failure in its own right. Generous while the crew is still talking (a real
  // provider streams tokens continuously); tight once the briefing has landed,
  // because `done` follows it immediately.
  const STALL_IDLE_MS = 60_000;
  const STALL_AFTER_BRIEFING_MS = 12_000;
  const [hasSavedPlan, setHasSavedPlan] = useState(false);
  /** Persisted prior runs (Supabase when enabled, else empty) — feeds the
   *  B3 second-trip proof. Local `meridian:history` is the same-trip ledger
   *  (re-entries); this is the cross-trip read. */
  const [pastRuns, setPastRuns] = useState<
    { savedAt: string; trip?: { origin?: { code?: string }; destination?: { code?: string }; requiredShiftMin?: number; direction?: "east" | "west" } | null; score: number }[]
  >([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [agentDrawerOpen, setAgentDrawerOpen] = useState(false);
  const [drawerUsed, setDrawerUsed] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeDraft, setRouteDraft] = useState<HomeRoute | null>(null);
  const [bookingText, setBookingText] = useState("");
  const [bookingError, setBookingError] = useState(false);
  const assistant = useAssistantLink();
  const install = useInstallPrompt();
  const feedStale = useFeedStale();
  /** Run state is memory-only; the saved plan + trip let a reload show the
   *  locked plan instead of the example preview. Recomputed when the route
   *  changes or a new briefing lands. */
  const [restoredLocked, setRestoredLocked] = useState<Map<string, DayPlan> | null>(null);
  const [restoredCitations, setRestoredCitations] = useState<Citation[]>([]);
  /** The saved plan's own baseline and trip. With no network the API cannot
   *  answer, and without these the clock has nothing to project — the plan
   *  is in the browser, so its inputs should be too. */
  const [restoredBaseline, setRestoredBaseline] = useState<WearableBaseline | null>(null);
  const [restoredTrip, setRestoredTrip] = useState<Trip | null>(null);
  const [restoredBaselineKind, setRestoredBaselineKind] = useState<BaselineKind | null>(null);
  const effectiveBaselineKind: BaselineKind =
    data?.baselineSource === "garmin"
      ? "garmin"
      : wakeBand
        ? "wake-band"
        : (data?.baselineKind ??
          restoredBaselineKind ??
          "demo-default");

  const guideRef = useRef<HTMLDivElement | null>(null);
  const setupRef = useRef<HTMLDivElement | null>(null);

  const exampleTrip =
    entry?.mode === "example" && departureDate
      ? buildTrip("LHR", "HND", departureDate)
      : null;
  const trip = (
    exampleTrip ??
    run.trip ??
    data?.trip ??
    restoredTrip ??
    null
  ) as Trip | null;
  // Below `trip` because auto follows the destination's sun; before a trip
  // exists there is no destination, so it stays on the device.
  const { theme, cycleTheme, sunUpNow } = useTheme(trip?.destination ?? null);

  const tripKey = trip
    ? `${trip.origin.code}-${trip.destination.code}-${trip.days[0]?.date ?? ""}`
    : null;
  const tripActions = useTripActions(
    tripKey,
    entry?.mode === "example" || isPreview(effectiveBaselineKind, wakeBand),
  );
  const tasteScope =
    entry?.mode === "trip"
      ? `${origin}-${dest}-${departureDate}`
      : entry?.mode === "example"
        ? `example:${departureDate}`
        : null;
  const tasteProfile = useTripTaste(tasteScope, entry?.mode === "trip");
  const placeChoices = usePlaceChoices(tasteScope, entry?.mode === "trip");
  const [restoredItinerary, setRestoredItinerary] = useState<TasteItinerary | null>(null);

  // The departure window the crew should plan around. Deriving the default from
  // the trip rather than hardcoding an id is what makes the picker correct on
  // westbound routes, where the eastbound ids don't exist at all.
  const recommendedFlightId = trip
    ? (getFlightRecommendations(trip).find((f) => f.recommended)?.id ?? null)
    : null;
  const selectedFlightId = flightChoice ?? recommendedFlightId;
  const tripQuery =
    `?origin=${origin}&dest=${dest}&date=${departureDate}` +
    (selectedFlightId ? `&flight=${selectedFlightId}` : "");

  /** The baseline the crew planned against: the run's own when it has one,
   *  the traveller's answer when they have given it, the demo fixture
   *  otherwise. Declared here rather than further down because the run's
   *  briefing saves it with the plan. */
  const baseline = exampleTrip
    ? GARMIN_BASELINE
    : (run.baseline ??
      resolveBaseline(wakeBand, data?.baseline ?? restoredBaseline ?? undefined));
  const esRef = useRef<EventSource | null>(null);
  const runIdRef = useRef<string | null>(null);
  const [checkInWarning, setCheckInWarning] = useState<string | null>(null);
  // Voice lives on /crew now; the first viewport no longer carries a voice
  // toggle (item 16 — Calm is "words + one number + one CTA"). We still
  // probe whether the deployment has a voice engine so the briefing can name
  // the option; the narrator is /crew's, not ours.
  const [voiceAvail, setVoiceAvail] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  /** The Edit sheet's panel. `aria-modal` without a focus trap is a claim the
   *  page doesn't honour, so Tab used to escape into the content behind it. */
  const setupPanelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(setupPanelRef, setupOpen);

  const stopVoice = useCallback(() => {
    stopVoiceAll();
  }, []);

  useEffect(() => {
    if (!departureDate || entry?.mode !== "trip") return;
    const ctrl = new AbortController();
    fetch("/api/trip" + tripQuery, { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`trip ${r.status}`);
        return r.json();
      })
      .then((d: TripData) => {
        if (ctrl.signal.aborted) return;
        const depDay = d?.trip?.days?.find((x) => x.dayIndex === d.trip.departureDayIndex);
        if (
          d?.trip?.origin?.code !== origin ||
          d?.trip?.destination?.code !== dest ||
          depDay?.date !== departureDate
        ) {
          setTripResolved(true);
          setTripFetchError(true);
          return;
        }
        setTripResolved(true);
        setTripFetchError(false);
        setData(d);
        // Open on the day that is actually today; fall back to the first
        // pre-flight day when the trip doesn't span today.
        const label = d?.trip ? pickHomeDayLabel(d.trip) : null;
        if (label) setSelectedDayLabel(label);
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        setTripResolved(true);
        setTripFetchError(true);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripQuery, departureDate, entry?.mode, fetchNonce]);

  const hook = trip
    ? { body: clockAt(trip.origin.utcOffsetMin), dest: clockAt(trip.destination.utcOffsetMin) }
    : null;

  useEffect(() => {
    const t = setTimeout(() => {
      const read = (k: string) => safeStorageGet(() => localStorage.getItem(k));
      try {
        initVoice().then(setVoiceAvail).catch(() => {});
        setHasSavedPlan(Boolean(read("meridian:lastPlan")));
        // B3 — the cross-trip read for the second-trip proof. Supabase-backed;
        // without keys this is `{ enabled: false }` and the proof stays null,
        // which is the honest "first trip" state, not a hole.
        fetch("/api/persistence/runs")
          .then((r) => r.json())
          .then((d) => {
            if (d?.enabled && Array.isArray(d.runs)) setPastRuns(d.runs);
          })
          .catch(() => {});
        if (typeof window !== "undefined") {
          const sp = new URLSearchParams(window.location.search);
          const resolved = resolveHomeEntry(
            sp,
            read("meridian:activeTrip"),
            read("meridian:lastTrip"),
          );
          setEntry(resolved);
          if (resolved.mode === "trip" && resolved.route) {
            setOrigin(resolved.route.origin);
            setDest(resolved.route.dest);
            setDepartureDate(resolved.route.date);
            try { localStorage.setItem("meridian:activeTrip", JSON.stringify(resolved.route)); } catch { /* best effort */ }
          } else {
            setDepartureDate(defaultDepartureDate());
          }
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
          // Per-agent speech is the Operator huddle on /crew. Here the crew's
          // words only stream into the drawer; the narrator speaks the handoff.
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
            text: `proposed ${e.move.title}: ${fmtMin(e.move.from.startMin)} → ${fmtMin(e.move.to.startMin)} — ${e.move.reason}`,
          });
          break;
        case "approval_request":
          push({ kind: "system", text: e.approval.summary });
          break;
        case "approval_result":
          push({ kind: e.status === "failed" ? "error" : "system", text: e.message });
          break;
        case "crew_question":
          push({ kind: "system", text: `the crew asks: ${e.question.text}` });
          break;
        case "crew_answer":
          push({
            kind: "system",
            text: e.skipped
              ? "no answer — the crew decides"
              : `you answered: ${e.label}${e.effect ? ` — ${e.effect}` : ""}`,
          });
          break;
        case "calendar_restore":
          push({ kind: "system", text: "calendar restored to its original times" });
          break;
        case "briefing":
          // Voice is opt-in only — the banner's Listen button speaks on tap.
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
                // The gate's promise, kept so the arrival surface has something
                // honest to score the trip against. Without it the only number
                // available after landing is the traveller's own recollection.
                coverage: e.coverage,
                tasteItinerary: e.tasteItinerary,
                // The baseline the plan was built on, kept with it so the
                // landing can be scored against the same model the clock was
                // showing. Without it the arrival page falls back to the
                // gate's own numbers — the claim, not the projection.
                baseline,
                baselineKind: effectiveBaselineKind,
                savedAt: new Date().toISOString(),
              }),
            );
            // A subscribed calendar tracks the newest plan without the
            // traveller re-importing the .ics by hand.
            // The briefing carries no trip — runTripRef has the run_start one.
            if (e.ics && runTripRef.current && e.days) {
              syncFeed({ ics: e.ics, trip: runTripRef.current, days: e.days });
            }
            // The ledger is the traveller's record of trips that happened, so
            // only runs that locked days belong in it. Writing unconditionally
            // put failed runs into the user-facing log: three `0.00` rows with
            // no day chips, reading as "shift complete" — failed runs leaking
            // into the one surface that is supposed to be trustworthy.
            // `lastPlan` above still saves unconditionally, because /arrival
            // scores against it and already handles a thin plan honestly.
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
                tasteItinerary: e.tasteItinerary,
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
          runIdRef.current = null;
          try { localStorage.removeItem("meridian:activeRunId"); } catch { /* ignore */ }
          esRef.current?.close();
          // While the run streamed, the day pills followed each lock — which
          // leaves them sitting on the last day the crew touched. Hand the
          // view back to the day the traveller would pick themselves.
          {
            const t = runTripRef.current ?? data?.trip;
            const label = t ? pickHomeDayLabel(t) : null;
            if (label) setSelectedDayLabel(label);
          }
          break;
      }
    },
    [push, stopVoice, data, baseline, run.errors.length, effectiveBaselineKind],
  );

  const cancelShift = useCallback(() => {
    const runId = runIdRef.current;
    if (runId) {
      fetch("/api/crew/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      }).catch(() => {});
    }
    esRef.current?.close();
    runIdRef.current = null;
    try { localStorage.removeItem("meridian:activeRunId"); } catch { /* ignore */ }
    stopVoice();
    push({ kind: "system", text: "shift cancelled by operator" });
    reset();
  }, [push, stopVoice, reset]);

  const beginStream = useCallback(
    (extra?: { checkins?: string; startDay?: number }) => {
      if (run.phase === "running") return;
      if (entry?.mode !== "trip" || !isValidHomeRoute({ origin, dest, date: departureDate })) return;
      if (!tasteProfile.ready) return;
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
      // The flight window travels with the run, so fixed asks route around the
      // real departure slot rather than the fixture's.
      if (selectedFlightId) params.set("flight", selectedFlightId);
      if (tasteProfile.ready && tasteProfile.favorites.length) {
        params.set("taste", JSON.stringify(tasteProfile.favorites));
      }
      const runId = crypto.randomUUID();
      runIdRef.current = runId;
      params.set("runId", runId);
      try { localStorage.setItem("meridian:activeRunId", runId); } catch { /* ignore */ }
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
        // EventSource retries the same URL with Last-Event-ID. Closing here used
        // to discard the server's ordered run log; now a drop only means the
        // client is waiting to catch up.
        push({ kind: "error", text: "connection interrupted — reconnecting" });
        setStreamError("Connection interrupted — reconnecting to the crew run…");
      };
    },
    [dispatch, handleSideEffects, push, reset, run.phase, tripQuery, checkInsParam, startDayParam, wakeBand, selectedFlightId, entry?.mode, origin, dest, departureDate, tasteProfile],
  );

  const startShift = useCallback(() => beginStream(), [beginStream]);

  const resumeRun = useCallback((runId: string) => {
    if (run.phase === "running") return;
    esRef.current?.close();
    reset();
    setEntries([]);
    setBriefingDismissed(false);
    runIdRef.current = runId;
    setStreamError("Reconnecting to the crew run…");
    const es = new EventSource(`/api/crew/run?runId=${encodeURIComponent(runId)}&resume=1`);
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
      es.close();
      runIdRef.current = null;
      try { localStorage.removeItem("meridian:activeRunId"); } catch { /* ignore */ }
      setStreamError("Couldn’t resume that crew run — start a new plan.");
      reset();
    };
  }, [dispatch, handleSideEffects, reset, run.phase]);

  useEffect(() => {
    const t = setTimeout(() => {
      const runId = safeStorageGet(() => localStorage.getItem("meridian:activeRunId"));
      if (runId) resumeRun(runId);
    }, 0);
    return () => clearTimeout(t);
  }, [resumeRun]);

  // Every check-in surface ends in the same place: record the marks through
  // the intake route — memory, Supabase, the graph write path — and then let
  // the replan run consume them as context. Before this, check-ins reached
  // the run but were never remembered.
  const persistCheckIns = useCallback(async (checkIns: CheckIn[]) => {
    const results = await Promise.allSettled(checkIns.map((c) => {
      const body: CheckInRequest = {
        dayIndex: c.dayIndex,
        kind: c.kind,
        startMin: c.startMin,
        status: c.status,
        text: c.text,
      };
      return fetch("/api/crew/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => {
        if (!r.ok) throw new Error(`check-in ${r.status}`);
      });
    }));
    return results.filter((r) => r.status === "rejected").length;
  }, []);

  // The feed's check-ins arrive as structured CheckIn[] — per-step did/skip
  // marks or one day-level verdict. Replan resumes the day after the latest
  // marked day.
  const sendDayCheckIn = useCallback(
    (checkIns: CheckIn[], lastMarkedDayIndex: number) => {
      if (!trip || !checkIns.length) return;
      void persistCheckIns(checkIns).then((failed) => {
        if (failed > 0) {
          setCheckInWarning(
            failed === checkIns.length
              ? "Marked for this run, but the check-in history could not be saved."
              : `${failed} of ${checkIns.length} marks could not be saved to history.`,
          );
        }
      });
      setCheckInWarning(null);
      beginStream({
        checkins: btoa(JSON.stringify(checkIns)),
        startDay: Math.min(lastMarkedDayIndex + 1, Math.max(trip.days.length - 1, 0)),
      });
    },
    [trip, beginStream, persistCheckIns],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape first and unconditionally — closing the sheet or cancelling a run
      // must work even from inside a text field. (It previously didn't: the old
      // handler returned early for INPUT/TEXTAREA before reaching Escape.)
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

  // Wedge watchdog. Runs only while a run is live, and reports the same
  // recoverable state `onerror` does — the CTA comes back either way.
  useEffect(() => {
    if (run.phase !== "running") return;
    const id = setInterval(() => {
      // A pending crew question is the same deliberate pause an approval is —
      // the run is waiting on the traveller, not wedged.
      if (run.question && !run.questionAnswer) return;
      if (run.approval && !run.approvalResult) return;
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
  }, [run.phase, run.approval, run.approvalResult, run.question, run.questionAnswer, reset]);

  const goGuide = () => {
    guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Setup is no longer a screen you navigate to — it's a sheet over Today.
  const openSetup = () => setSetupOpen(true);
  const closeSetup = () => setSetupOpen(false);

  const commitRoute = useCallback(
    (route: HomeRoute) => {
      if (!isValidHomeRoute(route)) return;
      esRef.current?.close();
      reset();
      setOrigin(route.origin);
      setDest(route.dest);
      setDepartureDate(route.date);
      setFlightChoice(null);
      setEntry((prev) => ({ mode: "trip", route, clockOpen: prev?.clockOpen ?? false }));
      setData(null);
      setTripResolved(false);
      setTripFetchError(false);
      setStreamError(null);
      setRestoredLocked(null);
      setRestoredCitations([]);
      setRestoredBaseline(null);
      setRestoredTrip(null);
      setRestoredBaselineKind(null);
      setRestoredItinerary(null);
      setRouteOpen(false);
      setRouteDraft(null);
      setSetupOpen(false);
      setMenuOpen(false);
      try {
        localStorage.setItem("meridian:activeTrip", JSON.stringify(route));
      } catch {
        /* best effort */
      }
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("origin", route.origin);
        url.searchParams.set("dest", route.dest);
        url.searchParams.set("date", route.date);
        url.searchParams.delete("example");
        window.history.replaceState(null, "", url.toString());
      } catch {
        /* ignore */
      }
    },
    [reset],
  );

  const openEntry = useCallback(() => {
    setEntryDraft(null);
    esRef.current?.close();
    reset();
    setEntry({ mode: "setup", route: null, clockOpen: false });
    setOrigin("");
    setDest("");
    setDepartureDate(defaultDepartureDate());
    setFlightChoice(null);
    setData(null);
    setTripResolved(false);
    setTripFetchError(false);
    setStreamError(null);
    setRestoredLocked(null);
    setRestoredCitations([]);
    setRestoredBaseline(null);
    setRestoredTrip(null);
    setRestoredBaselineKind(null);
    setRestoredItinerary(null);
    setRouteOpen(false);
    setRouteDraft(null);
    setSetupOpen(false);
    setMenuOpen(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("origin");
      url.searchParams.delete("dest");
      url.searchParams.delete("date");
      url.searchParams.delete("example");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }, [reset]);

  const exploreExample = useCallback((scenarioId?: DemoScenarioId) => {
    esRef.current?.close();
    reset();
    setEntry({ mode: "example", route: null, clockOpen: false, ...(scenarioId ? { scenarioId } : {}) });
    setOrigin("");
    setDest("");
    setDepartureDate(defaultDepartureDate());
    setFlightChoice(null);
    setData(null);
    setTripResolved(true);
    setTripFetchError(false);
    setStreamError(null);
    setRestoredLocked(null);
    setRestoredCitations([]);
    setRestoredBaseline(null);
    setRestoredTrip(null);
    setRestoredBaselineKind(null);
    setRestoredItinerary(null);
    setRouteOpen(false);
    setRouteDraft(null);
    setSetupOpen(false);
    setMenuOpen(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("origin");
      url.searchParams.delete("dest");
      url.searchParams.delete("date");
      url.searchParams.set("example", scenarioId ?? "1");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }, [reset]);

  useEffect(() => {
    if (entry?.mode !== "trip") return;
    const t = setTimeout(() => {
      try {
        const r = restorePlan(
          localStorage.getItem("meridian:lastPlan"),
          localStorage.getItem("meridian:lastTrip"),
          { origin, dest, date: departureDate },
        );
        setRestoredLocked(r?.locked ?? null);
        setRestoredCitations(r?.citations ?? []);
        setRestoredBaseline(r?.baseline ?? null);
        setRestoredTrip(r?.trip ?? null);
        setRestoredBaselineKind(r?.baselineKind ?? null);
        setRestoredItinerary(r?.tasteItinerary ?? null);
      } catch {
        setRestoredLocked(null);
        setRestoredItinerary(null);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [entry?.mode, origin, dest, departureDate, run.briefing]);

  const currentItinerary = run.briefing
    ? (run.briefing.tasteItinerary ?? null)
    : restoredItinerary;
  const effectiveItinerary =
    trip && currentItinerary && isTasteItinerary(currentItinerary) && itineraryMatchesTrip(currentItinerary, trip)
      ? currentItinerary
      : null;

  const effectiveLocked = exampleTrip
    ? EMPTY_LOCKED
    : run.locked.size
      ? run.locked
      : (restoredLocked ?? EMPTY_LOCKED);
  const effectivePhase =
    run.phase === "idle" && restoredLocked?.size ? "done" : run.phase;

  const { remindersOn, remindersBlocked, externalMark, toggleReminders } =
    useReminders({
      trip: exampleTrip ? null : trip,
      lockedDays: exampleTrip ? EMPTY_LOCKED : effectiveLocked,
      onMarkDay: setSelectedDayLabel,
    });

  const providerFallback = run.errors.length > 0;
  const rawCalendar = exampleTrip
    ? calendarFor(exampleTrip)
    : run.calendar.length > 0
      ? run.calendar
      : (data?.calendar ?? []);
  const currentEvents = run.calendar.length > 0 ? calendarWithMoves(run) : rawCalendar;
  const currentReadiness = trip
    ? meetingReadiness(trip, currentEvents, [...effectiveLocked.values()], baseline)
    : [];
  const activeCitations = run.citations.length ? run.citations : restoredCitations;
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
    // Calm is the default; a remembered Guided choice applies when the URL is silent.
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
      // Nothing on Home speaks without a tap — voice stays off here; Listen
      // buttons force their own utterance.
    }, 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="root" ref={menuRef}>
      <div className="beam" />
      <div className="in">
        {/* The one live region on the page. Mounted here rather than inside the
            drawer, which is closed by default — a blind traveller was getting
            silence through the entire run. */}
        <RunAnnouncer run={run} />

        {/* Top Sunlit Horizon Navigation */}
        <div className="nav rise">
          <button type="button" className="brand" onClick={goGuide}>
            <b>MERIDIAN</b>
            <span>Arrive better adjusted</span>
          </button>

          <div className="right">
            {!isOnline && (
              <span className="offline-pill" role="status" aria-label="Offline mode">
                ✈ Offline
              </span>
            )}
            {/* Item 16 — Calm (the Plan rung) is "words + one number + one CTA".
                The voice toggle, named agents, and the narrator now live behind
                the Crew rung on /crew, which has its own voice control. The
                first viewport was already busy; the dial relabel is what the
                teardown asked for, and removing this button is what makes the
                surface calm. */}
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
            {/* A run outlives its screen — while one is live, the menu's top
                row is its current step and a way back to watch it. */}
            {run.phase === "running" && (
              <Link href="/crew" className="m" role="menuitem" transitionTypes={["nav-forward"]} onClick={() => setMenuOpen(false)}>
                Crew working — {run.activeAgent ? CREW[run.activeAgent].name : "agents"}
                {run.lastTool ? ` → ${run.lastTool.tool}` : run.activeLabel ? ` on ${run.activeLabel}` : ""}
                {" · "}
                {run.locked.size}/{trip?.days.length ?? "?"} locked
              </Link>
            )}
            {/* Real buttons, not focusable divs: as divs these were in the tab
                order but Enter and Space did nothing, because a div has no
                activation behaviour. The <Link> siblings below are real
                anchors, so this also makes the menu homogeneous. */}
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
            <Link href="/?depth=guided" className="m" role="menuitem" onClick={() => setMenuOpen(false)}>
              Detailed view
            </Link>
            <Link href="/crew" className="m" role="menuitem" transitionTypes={["nav-forward"]} onClick={() => setMenuOpen(false)}>
              AI at work
            </Link>
            <Link href="/shift" className="m" role="menuitem" transitionTypes={["nav-forward"]} onClick={() => setMenuOpen(false)}>
              Shift work
            </Link>
            <Link href="/team" className="m" role="menuitem" transitionTypes={["nav-forward"]} onClick={() => setMenuOpen(false)}>
              Team view
            </Link>
            {/* The medical boundary and the privacy note, one tap from
                anywhere. They used to live at the end of the five-step setup,
                which meant a traveller who never opened the setup never read
                them. */}
            <button
              type="button"
              className="m"
              role="menuitem"
              onClick={() => {
                setDisclosureOpen(true);
                setMenuOpen(false);
              }}
            >
              What Meridian is, and is not
            </button>
            {/* Carries the trip being scored, so "Rate my trip" opens the
                journey you were actually on rather than the default one. */}
            <Link
              href={`/arrival?origin=${origin}&dest=${dest}&date=${departureDate}`}
              className="m"
              role="menuitem"
              transitionTypes={["nav-forward"]}
              onClick={() => setMenuOpen(false)}
            >
              Rate my trip
            </Link>
            {run.briefing && (
              <button
                type="button"
                className="m"
                onClick={async () => {
                  // Bet 3 — the share payload carries the hero meeting's
                  // body-time delta so the card leads with the passport line
                  // ("my body thinks it's 06:00"). Post-run the locked plan
                  // is the honest with-plan half, so no preview is passed;
                  // same contract the feed renders.
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
                      briefing: {
                        ...run.briefing,
                        ...(placeChoices.ready && Object.keys(placeChoices.state).length
                          ? { tasteChoices: placeChoices.state }
                          : {}),
                      },
                      trip: trip
                        ? {
                            ...shareTripContext(trip),
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
              Appearance:{" "}
              {theme === "auto"
                ? sunUpNow == null
                  ? "Auto · your device"
                  : `Auto · ${sunUpNow ? "day" : "night"} in ${trip?.destination.name ?? "your city"}`
                : theme === "light"
                  ? "Light"
                  : "Dark"}
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

        {/* A failed run, on the surface the traveller is looking at. The AgentDrawer
            entry for the same event is still recorded, but that drawer is closed
            by default, so it was never a report. */}
        {streamError && (
          <div className="run-error" role="alert">
            <span>{streamError}</span>
            <button type="button" onClick={() => setStreamError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        {/* The plan as the object being worked on, on the surface the
            traveller is actually on: while a run is live the board draws
            drafts, rejects and re-locks inline — a replan's days visibly go
            fluid here, not just on /crew. */}
        {run.phase === "running" && trip && (
          <div className="mb-[18px] h-52 overflow-hidden rounded-xl border border-line">
            <ShiftBoard
              days={trip.days}
              drafts={run.drafts}
              verdicts={run.verdicts}
              locked={run.locked}
              activeLabel={run.activeLabel}
              activeAgent={run.activeAgent}
              tripKey={tripKey ?? undefined}
            />
          </div>
        )}
        {run.phase !== "idle" && (
          <div className="mb-[18px] flex justify-end">
            <MorningCheckin
              phase={run.phase}
              lockedCount={run.locked.size}
              totalDays={trip?.days.length ?? 5}
              sessionStartedAt={run.sessionStartedAt}
              onCheckIn={(extra) => beginStream(extra)}
            />
          </div>
        )}
        {run.phase !== "idle" && entries.length > 0 && (
          <CrewTrace
            entries={entries}
            running={run.phase === "running"}
            lockedDays={run.locked.size}
          />
        )}
        {checkInWarning && (
          <div className="run-error" role="alert">
            <span>{checkInWarning}</span>
            <button type="button" onClick={() => setCheckInWarning(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {run.question && (
          <div className="mb-4.5">
            <CrewQuestionCard question={run.question} answer={run.questionAnswer} />
          </div>
        )}
        {run.approval && (!run.approvalResult || run.approvalResult.status !== "rejected") && (
          <div style={{ marginBottom: "18px" }}>
            <CalendarApprovalCard approval={run.approval} result={run.approvalResult} />
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


        {entry === null ? (
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
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: "flex", gap: 14, marginTop: 18, alignItems: "center" }}>
                <div className="skel" style={{ width: 22, height: 22, borderRadius: 999 }} />
                <div className="skel" style={{ width: 80, height: 14, borderRadius: 6 }} />
                <div className="skel" style={{ flex: 1, height: 14, borderRadius: 6 }} />
              </div>
            ))}
          </div>
        ) : entry.mode === "setup" ? (
          <div ref={setupRef}>
            <TripEntryScreen
              initialDate={departureDate || defaultDepartureDate()}
              onContinue={commitRoute}
              onExploreExample={() => exploreExample()}
              onExploreScenario={(id) => exploreExample(id)}
              initialRoute={entryDraft}
            />
          </div>
        ) : entry.mode === "example" && entry.scenarioId ? (
          <ScenarioExperience
            key={`${entry.scenarioId}:${departureDate}`}
            id={entry.scenarioId}
            departureDate={departureDate || defaultDepartureDate()}
            onChooseScenario={(id) => exploreExample(id)}
            onMakeTrip={(route) => {
              openEntry();
              setEntryDraft(route);
            }}
            onBack={openEntry}
          />
        ) : trip ? (
          <>
            {entry.mode === "trip" && tripFetchError && (
              <div className="run-error" role="alert">
                <span>We couldn&apos;t refresh this trip — your saved plan is still below.</span>
                <button type="button" onClick={() => { setTripFetchError(false); setFetchNonce((n) => n + 1); }}>
                  Retry
                </button>
              </div>
            )}
            {entry.mode === "example" && (
              <div className="example-banner" role="note">
                <span>Example trip — not your plan</span>
                <button type="button" className="example-banner-cta" onClick={openEntry}>
                  Plan my trip
                </button>
              </div>
            )}
            <div ref={setupRef} className="reading">
              <button
                type="button"
                className="trip-chip"
                onClick={() => {
                  setRouteOpen((v) => {
                    if (!v) setRouteDraft({ origin, dest, date: departureDate });
                    return !v;
                  });
                }}
                aria-expanded={routeOpen}
              >
                {trip.origin.name} → {trip.destination.name} ·{" "}
                <span className="trip-chip-date">
                  {trip.days.find((d) => d.dayIndex === trip.departureDayIndex)?.date
                    ? new Date(`${trip.days.find((d) => d.dayIndex === trip.departureDayIndex)!.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
                    : departureDate}
                  {" · "}
                </span>
                {Math.abs(trip.requiredShiftMin / 60)}h{" "}
                {trip.direction === "east" ? "ahead" : "behind"}{" "}
                <span className="trip-chip-change">✎ Change</span>
              </button>
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
                        commitRoute({ origin: r.origin, dest: r.dest, date: r.date });
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
                    origin={routeDraft?.origin ?? origin}
                    dest={routeDraft?.dest ?? dest}
                    date={routeDraft?.date ?? departureDate}
                    surface="cream"
                    onChange={(next) => {
                      setRouteDraft({ origin: next.origin, dest: next.dest, date: next.date });
                    }}
                  />
                  <button
                    type="button"
                    className="chip"
                    style={{ marginTop: 8, minHeight: 44 }}
                    disabled={!routeDraft || !isValidHomeRoute(routeDraft)}
                    onClick={() => routeDraft && commitRoute(routeDraft)}
                  >
                    Save trip
                  </button>
                </div>
              )}
            </div>

            <div
              className="reading"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}
            >
            {/* Orientation chrome waits for a plan to exist — on first landing
                the job is the question and the CTA, not a progress map or a
                mode picker the traveller can't yet choose between. */}
            {effectiveLocked.size > 0 && (
              <div className="secondary-action">
                <JourneySteps
                  current={
                    isTripFinished(trip, new Date())
                      ? 3
                      : 2
                  }
                />
              </div>
            )}
            </div>

            <div ref={guideRef} className="reading">
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
                baselineKind={entry.mode === "example" ? "demo-default" : effectiveBaselineKind}
                wakeBand={entry.mode === "example" ? null : wakeBand}
                onWakeBand={
                  entry.mode === "example"
                    ? undefined
                    : (b) => {
                        setWakeBand(b);
                        try {
                          if (b) localStorage.setItem("meridian:wakeBand", b);
                          else localStorage.removeItem("meridian:wakeBand");
                        } catch {
                          /* memory-only answer when storage is blocked */
                        }
                      }
                }
                onStartCrewSync={entry.mode === "example" ? openEntry : startShift}
                onCheckIn={
                  entry.mode === "example" ||
                  isPreview(effectiveBaselineKind, wakeBand)
                    ? undefined
                    : sendDayCheckIn
                }
                externalMark={entry.mode === "example" ? null : externalMark}
                remindersOn={remindersOn}
                onToggleReminders={entry.mode === "example" ? undefined : toggleReminders}
                remindersBlocked={remindersBlocked}
                feedStale={feedStale}
                onCancelRun={cancelShift}
                runActiveAgent={run.activeAgent}
                runActiveLabel={run.activeLabel}
                runSunProgress={run.sunProgress}
                pastRuns={pastRuns}
                actions={tripActions}
                tasteProfile={tasteScope ? tasteProfile : undefined}
                tasteItinerary={effectiveItinerary ?? undefined}
                canFitTaste={entry.mode === "trip"}
                placeChoices={tasteScope ? placeChoices : undefined}
                calendarSource={data?.calendarSource ?? "fixture"}
                sampleMode={entry.mode === "example"}
              />
              {effectiveLocked.size > 0 && baseline && (
                <BodyClockDetails
                  trip={trip}
                  locked={effectiveLocked}
                  baseline={baseline}
                  calendarEvents={currentEvents}
                  selectedDayLabel={selectedDayLabel}
                  marks={tripActions.marks}
                  baselineProvenance={
                    effectiveBaselineKind === "garmin"
                      ? "garmin"
                      : effectiveBaselineKind === "wake-band"
                        ? "self-reported"
                        : effectiveBaselineKind === "demo-default"
                          ? "demo"
                          : "unknown"
                  }
                  open={entry.clockOpen}
                />
              )}
              {effectiveLocked.size > 0 && (
                <PinnedDayRow days={trip.days} locked={effectiveLocked} />
              )}
            </div>

            {/* Mechanism lives one dial away, never on the Calm rung. */}
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
        ) : !tripResolved ? (
          <div ref={setupRef} aria-busy="true" aria-label="Loading your plan" style={{ padding: "24px 0" }}>
            <span className="sr-only">Loading your plan…</span>
            <div className="skel" style={{ width: "60%", height: 44, borderRadius: 999 }} />
            <div className="skel card" style={{ marginTop: 18, padding: 20 }}>
              <div className="skel" style={{ width: "40%", height: 14, borderRadius: 6 }} />
              <div className="skel" style={{ width: "80%", height: 20, borderRadius: 6, marginTop: 12 }} />
              <div className="skel" style={{ width: "65%", height: 14, borderRadius: 6, marginTop: 8 }} />
            </div>
          </div>
        ) : tripFetchError ? (
          <div ref={setupRef} className="run-error" role="alert" style={{ marginTop: 18 }}>
            <span>We couldn&apos;t load that trip — check your connection and try again.</span>
            <button type="button" onClick={() => { setTripResolved(false); setTripFetchError(false); setFetchNonce((n) => n + 1); }}>
              Retry
            </button>
          </div>
        ) : null}

        {/* The edit sheet: the same setup body, as an overlay on Today. */}
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
                baselineKind={effectiveBaselineKind}
                wakeBand={wakeBand}
                onWakeBand={(b) => {
                  setWakeBand(b);
                  try {
                    if (b) localStorage.setItem("meridian:wakeBand", b);
                    else localStorage.removeItem("meridian:wakeBand");
                  } catch {
                    /* memory-only answer when storage is blocked */
                  }
                }}
                onChangeRoute={(next) => {
                  commitRoute({ origin: next.origin, dest: next.dest, date: next.date });
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
                    Opening it reads your next step aloud — anyone with the link can hear it.
                  </p>
                  <details style={{ margin: "10px 0 0", fontSize: 12, color: "#a89383" }}>
                    <summary style={{ cursor: "pointer" }}>Use it with Siri Shortcuts</summary>
                    <ol style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: "#e8ded2", lineHeight: 1.7 }}>
                      <li>Open the Shortcuts app and tap +.</li>
                      <li>Add &quot;Get contents of URL&quot; and paste the link.</li>
                      <li>Add &quot;Speak text&quot;.</li>
                      <li>Name it &quot;Next Meridian step&quot; — then say &quot;Hey Siri, next Meridian step&quot;.</li>
                    </ol>
                  </details>
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

      {drawerUsed && <AgentDrawer
        open={agentDrawerOpen}
        onClose={() => setAgentDrawerOpen(false)}
        entries={entries}
        events={ledgerEvents(run)}
        running={run.phase === "running"}
        activeAgent={run.activeAgent}
        toolCalls={run.toolCalls}
        lockedDays={run.locked.size}
      />}

      <DisclosureSheet open={disclosureOpen} onClose={() => setDisclosureOpen(false)} />
      <BottomNav />
    </div>
  );
}
