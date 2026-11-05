"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Plane } from "lucide-react";
import { coverageOf, fmtMin } from "@/domain/circadian";
import { todayDayIndex } from "@/domain/today";
import { resolveBaseline, buildTrip, calendarFor, GARMIN_BASELINE, ADHERENCE_PROFILE, type WakeBand } from "@/domain/fixtures";
import { buildDailyNudgesForDay, getFlightRecommendations } from "@/domain/nudges";
import { previewPlan } from "@/domain/solver";
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
import { PLACE_GROUPS } from "@/components/MoreSheet";
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
const EverydayRhythm = dynamic(
  () => import("@/components/EverydayRhythm").then((m) => m.EverydayRhythm),
  { loading: () => null },
);
const TripEntryScreen = dynamic(
  () => import("@/components/TripEntryScreen").then((m) => m.TripEntryScreen),
);
import { HandoffBanner } from "@/components/HandoffBanner";
import { LandingHero } from "@/components/LandingHero";
import { LandingExampleDay } from "@/components/LandingExampleDay";
import { LandingInstrument } from "@/components/LandingInstrument";
import { LandingDepth } from "@/components/LandingDepth";
import { SampleJourneys } from "@/components/SampleJourneys";
import type { RouteGapRead } from "@/domain/route-gap";
const AgentDrawer = dynamic(
  () => import("@/components/AgentDrawer").then((m) => m.AgentDrawer),
);
import { RunAnnouncer } from "@/components/RunAnnouncer";
import { Stamp } from "@/components/ui/Stamp";
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
import { useMorphTransition } from "@/lib/use-morph-transition";
import { funnelKey, recordFunnel } from "@/lib/funnel";
import { useLightSweep } from "@/components/LightSweep";
import { safeStorageGet } from "@/lib/local-data";
import { useTripActions } from "@/lib/use-trip-actions";
import { useTripTaste } from "@/lib/use-trip-taste";
import { usePlaceChoices } from "@/lib/use-place-choices";
import { readTasteSignals } from "@/lib/taste-signals";
import { shareTripContext } from "@/lib/share-trip";
import { shareLink } from "@/lib/share-client";
import { ScenarioExperience } from "@/components/ScenarioExperience";
import type { DemoScenarioId } from "@/domain/demo-scenarios";
import { isTasteItinerary, itineraryMatchesTrip, type TasteItinerary } from "@/domain/taste";
import { JourneySteps } from "@/components/JourneySteps";
import { PlanReview } from "@/components/PlanReview";
import { TodayStage } from "@/components/TodayStage";
import { SubscribeCalendar } from "@/components/SubscribeCalendar";
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
  // Today hosts the plan artifact inline — the Now/The plan switch. It is
  // view state, not a destination: reset with the trip, never pushed to the
  // URL, and the full-page /review stays for deep links and shares.
  const [planView, setPlanView] = useState(false);
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [entry, setEntry] = useState<HomeEntry | null>(null);
  const [entryDraft, setEntryDraft] = useState<HomeRoute | null>(null);
  // Round 30 phase 3: the route the visitor is typing, resolved — the
  // landing stage plays their gap, their direction, their sky.
  const [visitorInfo, setVisitorInfo] = useState<{ gap: RouteGapRead; covPct: number | null } | null>(null);
  /* Phase 1 — the gap report must come back through a STABLE callback: an
     inline lambda is a new identity every render, so the child's report
     effect re-ran forever (the "Maximum update depth" loop). */
  const handleVisitorGap = useCallback(
    (gap: RouteGapRead | null, covPct: number | null) =>
      setVisitorInfo(gap ? { gap, covPct } : null),
    [],
  );
  /* ?via={shareId} — arrived from a shared card. The payload is fetched for
     the acknowledgment line and the route prefill; the id is kept so a
     committed trip counts back against the share (the funnel's bottom). */
  const [via, setVia] = useState<{
    id: string;
    trip: {
      origin?: { code?: string; name?: string };
      destination?: { code?: string; name?: string };
      departureDayIndex?: number;
      days?: { dayIndex?: number; date?: string }[];
    } | null;
    arrival: { deliveredHours: number; requiredHours: number; hoursOff: number } | null;
  } | null>(null);
  /** Null means "the window we'd recommend for this route". Deriving the
   *  default from the trip (rather than hardcoding an id) is what makes the
   *  picker correct on westbound routes, where the east ids don't exist. */
  const [flightChoice, setFlightChoice] = useState<string | null>(null);
  const [checkInsParam, setCheckInsParam] = useState("");
  const [startDayParam, setStartDayParam] = useState(0);
  const { run, dispatch, reset, send } = useRunState();
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
  // Openness is derived from the path the menu was opened on: place links
  // navigate without pre-closing it (the tapped row must survive into the
  // transition's old snapshot to morph into the destination header), and the
  // moment the route changes the derived mismatch folds the menu away.
  const pathname = usePathname();
  const [menuOpenedAt, setMenuOpenedAt] = useState<string | null>(null);
  const menuOpen = menuOpenedAt !== null && menuOpenedAt === pathname;
  // The utilities that used to crowd the menu (activity, appearance, install,
  // voice, the disclosure) live in their own sheet now, one hop from the
  // menu's last row.
  const [settingsOpen, setSettingsOpen] = useState(false);
  /* The motion language's morph wrapper: in-place surface changes run inside
     a same-document view transition where the API exists (docs/DESIGN.md). */
  const morph = useMorphTransition();
  /* Mode switches pass light across the page instead of snapping (docs/DESIGN.md
     · Motion language). The node mounts itself only while a pass runs. */
  const { sweep, node: sweepNode } = useLightSweep();
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
  /* The dawn overlay lifts over the freshly-arrived entry — a cross-fade,
   * not a swap. The timeout is the fallback for reduced-motion, where the
   * exit animation never runs and animationend never fires. */
  const [bootDone, setBootDone] = useState(false);
  useEffect(() => {
    if (entry === null) return;
    const t = setTimeout(() => setBootDone(true), 750);
    return () => clearTimeout(t);
  }, [entry]);
  const bootScene = (
    <div className="boot-stage">
      <p className="boot-mark">meridian</p>
      <p className="boot-crew" aria-hidden="true">
        {["Mara", "Jun", "Otto", "Iris", "Rex"].map((name, i) => (
          <span key={name} className="boot-crew-name" style={{ animationDelay: `${0.35 + i * 0.28}s` }}>
            {name}
          </span>
        ))}
      </p>
      <div className="boot-horizon" aria-hidden="true">
        <div className="boot-terminator" />
      </div>
    </div>
  );

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
  // The calendar the lock-time save needs (originals plus committed moves),
  // tracked from the run's own events so the briefing write needs no `run`
  // dep — identity churn there re-fires the on-mount resume.
  const saveCalendarRef = useRef<CalendarEvent[]>([]);
  const [checkInWarning, setCheckInWarning] = useState<string | null>(null);
  // Voice lives on /crew now; the first viewport no longer carries a voice
  // toggle (item 16 — Calm is "words + one number + one CTA"). We still
  // probe whether the deployment has a voice engine so the briefing can name
  // the option; the narrator is /crew's, not ours.
  const [voiceAvail, setVoiceAvail] = useState(false);
  /* Two refs, two dismiss zones: the dropdown panel and its trigger. (The
     ref used to sit on `.root` — the whole page — so "click outside to
     close" could never fire.) */
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
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
          // /?demo=1 and /demo are the same door — the story leads.
          if (sp.get("demo") !== null) {
            window.location.replace("/demo");
            return;
          }
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
            /* When the trip came from storage rather than the URL, write it
               into the URL (replace, not push). The address bar becomes the
               single source of truth, so Back from a later state lands on
               this trip instead of re-resolving storage and looking broken. */
            if (sp.get("origin") === null) {
              try {
                const url = new URL(window.location.href);
                url.searchParams.set("origin", resolved.route.origin);
                url.searchParams.set("dest", resolved.route.dest);
                url.searchParams.set("date", resolved.route.date);
                window.history.replaceState(null, "", url.toString());
              } catch { /* ignore */ }
            }
          } else {
            setDepartureDate(defaultDepartureDate());
          }
          if (sp.get("checkins")) setCheckInsParam(sp.get("checkins")!);
          const sd = Number(sp.get("startDay"));
          if (!Number.isNaN(sd)) setStartDayParam(sd);
          /* ?via={shareId}: fetch the same payload the public card renders
             (the GET exposes nothing the page doesn't), then prefill the
             sender's route so Continue is one tap, not three fields. */
          const viaId = sp.get("via");
          if (viaId) {
            fetch(`/api/share/${encodeURIComponent(viaId)}`)
              .then((r) => (r.ok ? r.json() : null))
              .then((d) => {
                const p = d?.payload;
                if (!p) return;
                setVia({ id: viaId, trip: p.trip ?? null, arrival: p.arrival ?? null });
                const t = p.trip;
                const dep = Array.isArray(t?.days)
                  ? t.days.find((x: { dayIndex?: number }) => x.dayIndex === t?.departureDayIndex)
                  : null;
                const candidate = { origin: t?.origin?.code, dest: t?.destination?.code, date: dep?.date };
                if (isValidHomeRoute(candidate)) {
                  setEntryDraft({
                    origin: candidate.origin.toUpperCase(),
                    dest: candidate.dest.toUpperCase(),
                    date: candidate.date,
                  });
                }
              })
              .catch(() => {});
          }
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
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || menuBtnRef.current?.contains(t)) return;
      setMenuOpenedAt(null);
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
          saveCalendarRef.current = (e.calendar as CalendarEvent[] | undefined) ?? [];
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
          saveCalendarRef.current = saveCalendarRef.current.map((ev) =>
            ev.id === e.move.eventId ? { ...ev, movedTo: e.move.to } : ev,
          );
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
          saveCalendarRef.current = saveCalendarRef.current.map((ev) => {
            const rest = { ...ev };
            delete rest.movedTo;
            return rest;
          });
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
                // The calendar the ics was built from (moves applied) — an
                // edit needs it to rebuild the same feed the server wrote.
                calendar: saveCalendarRef.current,
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
          // Funnel: the plan just changed hands — the run's third stage.
          // Keyed off the run's trip (the briefing event carries none).
          {
            const t = runTripRef.current;
            if (t) {
              recordFunnel(
                "handoff",
                funnelKey(t.origin.code, t.destination.code, t.days[0]?.date ?? ""),
              );
            }
          }
          push({ kind: "system", text: "morning handoff ready" });
          break;
        case "plan_seal":
          // The seal lands after the briefing — attach it to the saved plan
          // so the day-2 gate knows what to deposit against. Read-modify-write
          // because lastPlan was already persisted upstream of this event.
          try {
            const raw = localStorage.getItem("meridian:lastPlan");
            if (raw && runIdRef.current) {
              const saved = JSON.parse(raw);
              saved.seal = {
                runId: runIdRef.current,
                tripId: e.tripId,
                planHash: e.planHash,
              };
              localStorage.setItem("meridian:lastPlan", JSON.stringify(saved));
            }
          } catch {
            /* ignore */
          }
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
        const marks = readTasteSignals(localStorage);
        if (marks.kept.length || marks.dismissed.length) {
          params.set("marks", JSON.stringify(marks));
        }
      }
      const runId = crypto.randomUUID();
      runIdRef.current = runId;
      params.set("runId", runId);
      recordFunnel("run", funnelKey(origin, dest, departureDate));
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

  const resumedOnce = useRef(false);
  useEffect(() => {
    if (resumedOnce.current) return;
    const t = setTimeout(() => {
      resumedOnce.current = true;
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
        if (assistant.open) morph(() => assistant.closeSheet());
        else if (setupOpen) morph(() => setSetupOpen(false));
        else if (agentDrawerOpen) morph(() => setAgentDrawerOpen(false));
        else if (routeOpen) setRouteOpen(false);
        else if (settingsOpen) morph(() => setSettingsOpen(false));
        else if (menuOpen) setMenuOpenedAt(null);
        else if (run.phase === "running") cancelShift();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [run.phase, cancelShift, agentDrawerOpen, menuOpen, settingsOpen, setupOpen, routeOpen, assistant, morph]);

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
          : "The crew stopped responding mid-run. Anything already verified is kept — run it again when you’re ready.",
      );
      reset();
    }, 4000);
    return () => clearInterval(id);
  }, [run.phase, run.approval, run.approvalResult, run.question, run.questionAnswer, reset]);

  const goGuide = () => {
    guideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Setup is no longer a screen you navigate to — it's a sheet over Today.
  // Both directions run inside a same-document view transition so the menu
  // row morphs into the sheet instead of a drawer sliding up (docs/DESIGN.md ·
  // Motion language).
  const openSetup = () => morph(() => setSetupOpen(true));
  const closeSetup = () => morph(() => setSetupOpen(false));

  /* The blank-slate half of every entry-mode change: kill the stream and the
     run, clear the trip and anything restored for it, and fold the overlays
     back up. Entry-mode transitions push history entries (the browser's Back
     should walk the states, not exit the app), and the popstate handler below
     resolves the URL the same way the mount effect does. */
  const resetTripView = useCallback(() => {
    esRef.current?.close();
    reset();
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
    setMenuOpenedAt(null);
    setSettingsOpen(false);
    setPlanView(false);
  }, [reset]);

  const commitRoute = useCallback(
    (route: HomeRoute) => {
      if (!isValidHomeRoute(route)) return;
      recordFunnel("entry", funnelKey(route.origin, route.dest, route.date));
      resetTripView();
      setOrigin(route.origin);
      setDest(route.dest);
      setDepartureDate(route.date);
      setEntry((prev) => ({ mode: "trip", route, clockOpen: prev?.clockOpen ?? false }));
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
        url.searchParams.delete("step");
        url.searchParams.delete("day");
        url.searchParams.delete("via");
        window.history.pushState(null, "", url.toString());
      } catch {
        /* ignore */
      }
      /* Funnel bottom: this trip was committed off a shared card. Best-effort
         — the counter is a metric, never a dependency of the save. */
      if (via) {
        fetch(`/api/share/${encodeURIComponent(via.id)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: true }),
        }).catch(() => {});
      }
    },
    [resetTripView, via],
  );

  const openEntry = useCallback(() => {
    setEntryDraft(null);
    resetTripView();
    setEntry({ mode: "setup", route: null, clockOpen: false });
    setOrigin("");
    setDest("");
    setDepartureDate(defaultDepartureDate());
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("origin");
      url.searchParams.delete("dest");
      url.searchParams.delete("date");
      url.searchParams.delete("example");
      url.searchParams.delete("step");
      url.searchParams.delete("day");
      window.history.pushState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }, [resetTripView]);

  const exploreExample = useCallback((scenarioId?: DemoScenarioId) => {
    resetTripView();
    setEntry({ mode: "example", route: null, clockOpen: false, ...(scenarioId ? { scenarioId } : {}) });
    setOrigin("");
    setDest("");
    setDepartureDate(defaultDepartureDate());
    setTripResolved(true);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("origin");
      url.searchParams.delete("dest");
      url.searchParams.delete("date");
      url.searchParams.delete("step");
      url.searchParams.delete("day");
      url.searchParams.set("example", scenarioId ?? "1");
      window.history.pushState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }, [resetTripView]);

  /* Back/forward walk the entry states: the URL is the source of truth, so a
     pop re-resolves the entry exactly the way the mount effect does — trip,
     example, scenario or setup — and clears whatever the popped-from state
     had running. */
  useEffect(() => {
    const onPop = () => {
      try {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get("demo") !== null) {
          window.location.replace("/demo");
          return;
        }
        /* Resolve from the URL alone: storage is written *during* the session
           (commitRoute saves the trip), so using it as a fallback made two
           identical-looking `/` entries resolve differently depending on when
           Back was pressed. With the URL as the only source of truth, Back
           walks exactly the states the traveller walked forward through. */
        const resolved = resolveHomeEntry(sp, null, null);
        resetTripView();
        setEntry(resolved);
        setTripResolved(resolved.mode === "example");
        if (resolved.mode === "trip" && resolved.route) {
          setOrigin(resolved.route.origin);
          setDest(resolved.route.dest);
          setDepartureDate(resolved.route.date);
          try {
            localStorage.setItem("meridian:activeTrip", JSON.stringify(resolved.route));
          } catch {
            /* best effort */
          }
        } else {
          setOrigin("");
          setDest("");
          setDepartureDate(defaultDepartureDate());
        }
        setCheckInsParam(sp.get("checkins") ?? "");
        const sd = Number(sp.get("startDay"));
        setStartDayParam(Number.isNaN(sd) ? 0 : sd);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [resetTripView]);

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
  // The calendar the lock-time save needs, without putting `run` into the
  // side-effects callback's deps (identity churn would re-fire the on-mount
  // resume). Written post-render, read at briefing time.
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

  // The stage's honest inputs (round 20): how deep the sky's dawn still runs,
  // and today's steps in the exact shape the feed will confirm them — same
  // builder, same marks, no separate source of truth. Example mode has no
  // locked days, so the stage falls back to the same preview the feed reads.
  const stagePreview = useMemo(
    () =>
      trip
        ? previewPlan({
            trip,
            calendar: currentEvents,
            adherence: data?.adherence ?? ADHERENCE_PROFILE,
            baseline,
          })
        : null,
    // One preview for the stage and the feed — gating this to example mode
    // left the trip-mode hero saying “the crew is reading your route”
    // forever while the feed below showed the plan (the 2026-11-07 review).
    [trip, currentEvents, data?.adherence, baseline],
  );
  const stageOwedMin = useMemo(() => {
    if (!trip) return 0;
    const lockedDays = [...effectiveLocked.values()];
    if (lockedDays.length) return coverageOf(trip, lockedDays).residualMin;
    let residual: number | null = null;
    stagePreview?.forEach((s) => {
      if (s?.result.coverage) residual = s.result.coverage.residualMin;
    });
    return residual ?? Math.abs(trip.requiredShiftMin);
  }, [trip, effectiveLocked, stagePreview]);
  const stageBodyShiftMin = useMemo(
    () => [...effectiveLocked.values()].reduce((s, d) => s + d.shiftMin, 0),
    [effectiveLocked],
  );
  // How many days the crew has locked — the sky face's rays. Locked days win;
  // before any run, the preview plans stand in (same fallback the feed uses).
  const stageDaysLocked = useMemo(() => {
    if (effectiveLocked.size) return effectiveLocked.size;
    if (!stagePreview) return 0;
    return [...stagePreview.values()].filter((s) => s !== null).length;
  }, [effectiveLocked, stagePreview]);
  const stageNudges = useMemo(() => {
    if (!trip) return null;
    const idx = todayDayIndex(trip, new Date());
    if (idx === null) return null;
    const spec = trip.days.find((d) => d.dayIndex === idx);
    if (!spec) return null;
    const plan = effectiveLocked.get(spec.label) ?? stagePreview?.get(spec.label)?.plan ?? null;
    if (!plan) return null;
    return buildDailyNudgesForDay({
      trip,
      dayIndex: idx,
      plan,
      baseline,
      calendarEvents: currentEvents,
      moves: run.moves,
      citations: activeCitations,
      verdicts: run.verdicts.get(spec.label),
      adherence: data?.adherence,
    });
  }, [
    trip,
    effectiveLocked,
    stagePreview,
    baseline,
    currentEvents,
    run.moves,
    run.verdicts,
    activeCitations,
    data?.adherence,
  ]);

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

  // The Appearance row's words, computed once for the settings sheet.
  const themeLabel =
    theme === "auto"
      ? sunUpNow == null
        ? "Auto · your device"
        : `Auto · ${sunUpNow ? "day" : "night"} in ${trip?.destination.name ?? "your city"}`
      : theme === "light"
        ? "Light"
        : "Dark";
  // Install row shows only where installing is a real, available action.
  const installVisible = (() => {
    if (typeof window === "undefined") return false;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone;
    if (standalone) return false;
    const iOS = /iP(hone|ad|od)/.test(navigator.userAgent);
    return Boolean(install.installEvt) || iOS;
  })();

  return (
    <div className={entry === null || entry.mode === "setup" ? "root landing-ink" : "root"}>
      {sweepNode}
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
                <Plane size={11} aria-hidden="true" /> Offline
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
              ref={menuBtnRef}
              className="btn"
              onClick={() => setMenuOpenedAt(menuOpen ? null : pathname)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              Menu
            </button>
          </div>
        </div>

        {/* Dropdown Menu */}
        {menuOpen && (
          <div ref={menuRef} className="menu rise" style={{ animationDelay: ".1s" }} role="menu">
            {/* A run outlives its screen — while one is live, the menu's top
                row is its current step and a way back to watch it. */}
            {run.phase === "running" && (
              <Link href="/crew" className="m" role="menuitem" transitionTypes={["nav-forward"]} onClick={() => setMenuOpenedAt(null)}>
                Crew working — {run.activeAgent ? CREW[run.activeAgent].name : "agents"}
                {run.lastTool ? ` → ${run.lastTool.tool}` : run.activeLabel ? ` on ${run.activeLabel}` : ""}
                {" · "}
                {run.locked.size}/{trip?.days.length ?? "?"} locked
              </Link>
            )}
            {/* Destinations live in one place — the More sheet, reachable
                from the tab bar on every page. The menu's job is this trip:
                working the plan, the view, the share, the settings. */}
            {/* The landing is the door in front of those places, and on a
                wide screen there is no tab bar to carry them — so the
                landing's own menu does. Without this the destinations were
                unreachable from the one surface every visitor meets. */}
            {entry?.mode === "setup" && (
              <>
                <p className="menu-label">More places</p>
                {PLACE_GROUPS.map((g) => (
                  <div key={g.label}>
                    <p className="menu-label">{g.label}</p>
                    {g.places.map((pl) => (
                      <Link
                        key={pl.href}
                        href={pl.href}
                        className="m"
                        role="menuitem"
                        transitionTypes={["nav-forward"]}
                        onClick={() => setMenuOpenedAt(null)}
                      >
                        {pl.label}
                      </Link>
                    ))}
                  </div>
                ))}
                {/* Trips was a tab on the app surfaces; the landing has no
                    tab bar, so the menu keeps the way back to it. */}
                <Link
                  href="/history"
                  className="m"
                  role="menuitem"
                  transitionTypes={["nav-forward"]}
                  onClick={() => setMenuOpenedAt(null)}
                >
                  Your trips
                </Link>
              </>
            )}
            {/* The landing has no trip yet, so it does not claim "This trip"
                over a menu of trip actions. The label says what the rows
                actually are. */}
            <p className="menu-label">{entry?.mode === "setup" ? "This app" : "This trip"}</p>
            {/* Real buttons, not focusable divs: as divs these were in the tab
                order but Enter and Space did nothing, because a div has no
                activation behaviour. The <Link> siblings above are real
                anchors, so this also makes the menu homogeneous. */}
            {/* The sheet below is gated on `trip` — render the item only
                when it can open something, or the click silently no-ops. */}
            {trip && (
              <button
                type="button"
                className={`m${setupOpen ? "" : " vt-morph-trip"}`}
                role="menuitem"
                onClick={() => {
                  openSetup();
                  setMenuOpenedAt(null);
                }}
              >
                Trip settings
              </button>
            )}
            {/* Depth is a view choice, not a place — toggling it used to be a
                Link to /?depth=guided, which reloaded the whole page (killing
                any live run) and left the param stuck in the URL. */}
            <button
              type="button"
              className="m"
              role="menuitem"
              onClick={() => {
                sweep();
                const next = depth === "guided" ? null : "guided";
                setDepth(next);
                try {
                  if (next) localStorage.setItem(DEPTH_KEY, next);
                  else localStorage.removeItem(DEPTH_KEY);
                } catch { /* storage unavailable */ }
                try {
                  const url = new URL(window.location.href);
                  if (url.searchParams.has("depth")) {
                    url.searchParams.delete("depth");
                    window.history.replaceState(null, "", url.toString());
                  }
                } catch { /* ignore */ }
                setMenuOpenedAt(null);
              }}
            >
              {depth === "guided" ? "Calm view" : "Detailed view"}
            </button>
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
                  setMenuOpenedAt(null);
                  await shareLink(url, "My Meridian shift plan");
                }}
              >
                Share plan →
              </button>
            )}
            {/* The utilities moved out of the menu — it is for going places
                and working the trip, not for toggling the app. The medical
                boundary and the privacy note stay one hop deeper, and still
                live in the More sheet too, so they are never further than
                two taps from anywhere. */}
            <button
              type="button"
              className={`m${settingsOpen ? "" : " vt-morph-settings"}`}
              role="menuitem"
              onClick={() => {
                morph(() => {
                  setMenuOpenedAt(null);
                  setSettingsOpen(true);
                });
              }}
            >
              Settings &amp; about
            </button>
          </div>
        )}

        {/* Settings & about — the sheet behind the menu's last row. Reuses
            the More sheet's chrome: bottom sheet on the phone, floating
            panel on wider screens. */}
        {settingsOpen && (
          <>
            <div className="more-sheet-backdrop" role="presentation" onClick={() => morph(() => setSettingsOpen(false))} />
            <div role="dialog" aria-modal="true" aria-label="Settings and about" className="more-sheet vt-morph-settings">
              <p className="more-sheet-label">Settings</p>
              <button
                type="button"
                className="more-sheet-item vt-morph-crew"
                onClick={() =>
                  // Round 18: the row grows into the crew panel — one view
                  // transition carries the settings sheet closing and the
                  // drawer opening together.
                  morph(() => {
                    setSettingsOpen(false);
                    setDrawerUsed(true);
                    setAgentDrawerOpen(true);
                  })
                }
              >
                <span>Activity log</span>
                <small>everything the crew did, in order</small>
              </button>
              <button
                type="button"
                className="more-sheet-item"
                onClick={() => {
                  sweep();
                  cycleTheme();
                }}
              >
                <span>Appearance</span>
                <small>{themeLabel} — tap to change</small>
              </button>
              {installVisible && (
                <button
                  type="button"
                  className="more-sheet-item"
                  onClick={() => {
                    setSettingsOpen(false);
                    install.promptInstall();
                  }}
                >
                  <span>Install app</span>
                  <small>Meridian on your home screen</small>
                </button>
              )}
              {hasSavedPlan && (
                <button
                  type="button"
                  className={`more-sheet-item${assistant.open ? "" : " vt-morph-voice"}`}
                  onClick={() => {
                    morph(() => {
                      setSettingsOpen(false);
                      void assistant.openSheet();
                    });
                  }}
                >
                  <span>Voice assistant</span>
                  <small>talk the next step through</small>
                </button>
              )}
              <p className="more-sheet-label">About</p>
              <button
                type="button"
                className="more-sheet-item vt-morph-disclosure"
                onClick={() =>
                  // Round 18: the row grows into the disclosure panel.
                  morph(() => {
                    setSettingsOpen(false);
                    setDisclosureOpen(true);
                  })
                }
              >
                <span>What Meridian is, and is not</span>
                <small>timing guidance, not medical advice</small>
              </button>
            </div>
          </>
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


        {entry !== null && !bootDone && (
          <div
            className="boot boot-overlay"
            aria-hidden="true"
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) setBootDone(true);
            }}
          >
            {bootScene}
          </div>
        )}
        {entry === null ? (
          <div ref={setupRef} aria-busy="true" aria-label="Loading your plan" className="boot">
            <span className="sr-only">Loading your plan…</span>
            {bootScene}
          </div>
        ) : entry.mode === "setup" ? (
          /* Design reset Phase 1 — the Statement landing on ink: type first,
             the form is the hero's action, the example day and the sample
             journeys follow as their own sections. */
          <div ref={setupRef} className="landing-statement">
            <LandingDepth tone="ink" />
            <LandingHero visitor={visitorInfo} />
            {via && (
              /* The shared card that brought them here, acknowledged with its
                 own numbers — receipt when there is one, route always. */
              <p className="via-note" role="note">
                {via.arrival
                  ? `A traveller's crew carried ${via.arrival.deliveredHours.toFixed(1)}h of their ${via.arrival.requiredHours.toFixed(1)}h shift`
                  : "A traveller shared their Meridian plan"}
                {via.trip?.origin?.name && via.trip?.destination?.name
                  ? ` on ${via.trip.origin.name} → ${via.trip.destination.name}`
                  : ""}
                .{entryDraft ? " Their route is prefilled below — change anything." : ""}
              </p>
            )}
            <div className="landing-entry-stage">
              <TripEntryScreen
                initialDate={departureDate || defaultDepartureDate()}
                onContinue={commitRoute}
                onExploreExample={() => exploreExample()}
                initialRoute={entryDraft}
                onGapChange={handleVisitorGap}
              />
              {/* Phase 2 — the glass instrument: the traveller's meridian
                  rendered as a refractive medallion beside the form. */}
              <LandingInstrument visitor={visitorInfo} />
            </div>
            <LandingExampleDay />
            <SampleJourneys onChoose={(id) => exploreExample(id)} />
            {/* The habit tracker stays after the funnel — for the visitor
                who is still looking around. */}
            <EverydayRhythm />
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
                <Stamp kind="example" />
                <span className="example-banner-note">Not your plan</span>
                <Link href="/demo" className="example-banner-cta" transitionTypes={["nav-forward"]}>
                  See the story first
                </Link>
                <button type="button" className="example-banner-cta" onClick={openEntry}>
                  Plan my trip
                </button>
              </div>
            )}
            {/* Round 20: first paint is the full-bleed stage — sky, route,
                clocks, the one next step. The rest of Today unfolds below as
                sticky scenes; the route editor stays in flow, right under
                the stage, where the chip opens it. */}
            <div className="today-stage-wrap" id="journey-trip">
              <div className="today-stage-pin">
                <TodayStage
                  trip={trip}
                  owedMin={stageOwedMin}
                  bodyShiftMin={stageBodyShiftMin}
                  nudges={stageNudges}
                  marks={tripActions.marks}
                  daysLocked={stageDaysLocked}
                  running={effectivePhase === "running"}
                  // The run's door shows only where a run can actually start:
                  // idle (nothing locked or running) and in trip mode — the
                  // example journey's crew sync lives on its own card.
                  canStart={effectivePhase === "idle" && entry?.mode === "trip"}
                  onStart={startShift}
                  routeOpen={routeOpen}
                  onChip={() => {
                    setRouteOpen((v) => {
                      if (!v) setRouteDraft({ origin, dest, date: departureDate });
                      return !v;
                    });
                  }}
                />
              </div>
              {/* Scroll room: keeps the stage pinned for one beat past the
                  first viewport before the recede hand-off. */}
              <div className="today-stage-run" aria-hidden="true" />
            </div>
            <div ref={setupRef} className="reading">
              {routeOpen && (
                <div style={{ marginTop: 8 }}>
                  <div className="card rise" style={{ padding: "12px 14px", marginBottom: 10 }}>
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

            <div className="today-flow">
            <div
              className="reading"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}
            >
            {/* Orientation chrome waits for a plan to exist — on first landing
                the job is the question and the CTA, not a progress map or a
                mode picker the traveller can't yet choose between. */}
            {effectiveLocked.size > 0 && (
              <>
                <div className="secondary-action">
                  <JourneySteps
                    current={
                      isTripFinished(trip, new Date())
                        ? 3
                        : 2
                    }
                    hrefs={[
                      "#journey-trip",
                      "/review",
                      "#journey-days",
                      `/arrival?origin=${origin}&dest=${dest}&date=${departureDate}`,
                    ]}
                  />
                </div>
                <div className="today-cal-action">
                  <SubscribeCalendar
                    ics={run.briefing?.ics ?? ""}
                    trip={trip}
                    days={Array.from(effectiveLocked.values())}
                    className="chip"
                  />
                </div>
              </>
            )}
            </div>

            {/* The payoff finds the traveller: once the trip is over, Today
                leads with the arrival report instead of leaving it behind a
                menu. Example journeys never land — only the real trip does. */}
            {entry.mode === "trip" && isTripFinished(trip, new Date()) && (
              <div className="reading">
                <Link
                  href={`/arrival?origin=${origin}&dest=${dest}&date=${departureDate}`}
                  className="landed-card"
                  transitionTypes={["nav-forward"]}
                >
                  <span className="landed-card-title">You&apos;ve landed in {trip.destination.name} →</span>
                  <span className="landed-card-sub">See how your body clock adjusted — the plan&apos;s promise, settled.</span>
                </Link>
              </div>
            )}

            <div ref={guideRef} className="reading">
              {/* The plan is a view of Today, not another destination: one
                  switch between the live feed and the signed artifact (the
                  same component /review renders), shown only once a plan
                  exists to look at. */}
              {(effectiveLocked.size > 0 || run.briefing) && (
                <div className="pill plan-switch" role="group" aria-label="Today or the full plan">
                  <button
                    type="button"
                    className={planView ? "" : "on"}
                    onClick={() => {
                      if (planView) sweep();
                      setPlanView(false);
                    }}
                  >
                    Now
                  </button>
                  <button
                    type="button"
                    className={planView ? "on" : ""}
                    onClick={() => {
                      if (!planView) sweep();
                      setPlanView(true);
                    }}
                  >
                    The plan
                  </button>
                </div>
              )}
              {planView ? (
                <PlanReview inline />
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
                onReplanConstraints={sendDayCheckIn}
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
                planEdit={trip ? {
                  onPlansChanged: (plans) => {
                    setRestoredLocked(new Map(plans.map((d) => [d.label, d])));
                    if (run.locked.size) send({ kind: "plans_edited", days: plans });
                  },
                  disabledReason:
                    effectivePhase !== "idle" && effectivePhase !== "done"
                      ? "The crew is still planning — try again when it's done."
                      : null,
                  isLocked: (dayIndex, ivIndex) => {
                    const spec = trip.days.find((d) => d.dayIndex === dayIndex);
                    const plan = [...effectiveLocked.values()].find((d) => d.dayIndex === dayIndex);
                    const iv = plan?.interventions[ivIndex];
                    if (!spec || iv?.kind !== "light_exposure") return false;
                    const mark = tripActions.marks.find((m) => m.id === `${spec.label}-sunlight`);
                    return mark?.status === "done" || mark?.status === "skipped";
                  },
                  firstEditableDay: (() => {
                    const ti = todayDayIndex(trip, new Date());
                    if (ti !== null) return ti;
                    const last = trip.days[trip.days.length - 1]?.dayIndex ?? 0;
                    return new Date() < new Date(`${trip.days[0].date}T00:00:00Z`) ? 0 : last + 1;
                  })(),
                } : undefined}
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
                </>
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
            <div className="sheet-panel vt-morph-trip" ref={setupPanelRef} onClick={(e) => e.stopPropagation()}>
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
            onClick={() => morph(() => assistant.closeSheet())}
          >
            <div className="sheet-panel vt-morph-voice" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="sheet-close"
                onClick={() => morph(() => assistant.closeSheet())}
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
        onClose={() => morph(() => setAgentDrawerOpen(false))}
        entries={entries}
        events={ledgerEvents(run)}
        running={run.phase === "running"}
        activeAgent={run.activeAgent}
        toolCalls={run.toolCalls}
        lockedDays={run.locked.size}
      />}

      <DisclosureSheet
        open={disclosureOpen}
        onClose={() => morph(() => setDisclosureOpen(false))}
        panelClassName="vt-morph-disclosure"
      />
      {/* The tab bar is the *app's* navigation — Today, Trips, More. The
          landing is none of those: it is the door in front of them, and a
          visitor standing at it has no trip yet, so a highlighted "Today"
          would be a claim the page cannot make. On this surface the corner
          Menu is the single door instead. */}
      {entry?.mode !== "setup" && <BottomNav />}
    </div>
  );
}
