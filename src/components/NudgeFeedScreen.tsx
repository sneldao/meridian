"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { coverageOf, fmtMin } from "@/domain/circadian";
import { StageStars } from "@/components/StageStars";
import { stageSkyFor } from "@/domain/stage-sky";
import { FeedWorld, Room } from "@/components/FeedWorld";
import { cssRgb } from "@/lib/meridian-sky-webgl";
import type { RoomCtx } from "@/domain/feed-scenes";
import { useLiveDate } from "@/lib/use-live-date";
import {
  buildDailyNudgesForDay,
  recoveryTip,
  stepImpactMin,
  type NudgeCategory,
  type TravelerNudge,
} from "@/domain/nudges";
import { stepReceipt } from "@/domain/receipts";
import { TasteDiscovery } from "@/components/TasteDiscovery";
import { TasteItineraryCard } from "@/components/TasteItineraryCard";
import { ArrivalDayView } from "@/components/ArrivalDayView";
import { PerformanceBrief } from "@/components/PerformanceBrief";
import { LightWindowPanel } from "@/components/LightWindowPanel";
import { performanceMoment } from "@/domain/trip-performance";
import { InteractiveDay } from "@/components/InteractiveDay";
import { InteractiveDayEditor } from "@/components/InteractiveDayEditor";
import { localPlanStore } from "@/lib/plan-store";
import { useMagnetic } from "@/lib/motion/magnetic";
import { buildDayScene } from "@/domain/day-scene";
import { SunSelf } from "@/components/SunSelf";
import { sunSelfRead } from "@/domain/sun-self";
import { DayCardShare } from "@/components/DayCardShare";
import { RightNowCard } from "@/components/RightNowCard";
import { dayPlacePin, postTasteSignal } from "@/lib/place-choices";
import { placeProvenance } from "@/lib/crew-jobs";
import { provenanceChips } from "@/domain/provenance";
import { insightCards, type InsightCardModel } from "@/domain/insights";
import { InsightCards } from "@/components/InsightCards";
import {
  crewAnswer,
  type CrewAnswerContext,
  type CrewFacts,
} from "@/domain/crew-answer";
import { CrewAsk } from "@/components/CrewAsk";
import type { CrewAccountRow } from "@/components/CrewAccount";
import { recordTasteSignal } from "@/lib/taste-signals";
import { tasteSelectionKey } from "@/domain/taste";
import type { DestinationPlace } from "@/domain/taste";
import type { PlaceChoices } from "@/lib/use-place-choices";
import { isTasteResponse, type TasteItinerary, type TasteResponse } from "@/domain/taste";
import type { TripTaste } from "@/lib/use-trip-taste";
import { previewPlan } from "@/domain/solver";
import {
  dayPlace,
  heroReadiness,
  nowMinOnDay,
  pickNextStep,
  previewLockedOf,
  todayDayIndex,
} from "@/domain/today";
import { ADHERENCE_PROFILE, type WakeBand } from "@/domain/fixtures";
import dynamic from "next/dynamic";
// ~90KB of globe + world-atlas JSON — a separate chunk, fetched only when the
// globe actually opens.
const HeroDawnPanel = dynamic(
  () => import("@/components/HeroDawnPanel").then((m) => m.HeroDawnPanel),
  {
    loading: () => (
      <div
        style={{ minHeight: 540, borderRadius: 18, background: "#1E1B18" }}
        aria-hidden="true"
      />
    ),
  },
);
import { evalChipLabel, evalChipTitle } from "@/components/ui/eval-chip";
import { isPreview, tapBecomesCheckIn } from "@/domain/preview";
import { constraintsFromSkips, checkInsFromConstraints } from "@/domain/constraints";
import { calendarSummary } from "@/domain/hero";
import { secondTripCopy, secondTripProof } from "@/domain/second-trip";
import { meetingReadiness } from "@/domain/readiness";
import { friendlyDayLabel } from "@/lib/day-label";
import type { DaySpec } from "@/domain/types";
import { isTripFinished } from "@/lib/trip-status";
import type { TripActions } from "@/lib/use-trip-actions";
import { Bell, BellRing, MapPin } from "lucide-react";
import { CAT_ICON, DaySkyStrip } from "@/components/DaySkyStrip";
import { VoiceControls } from "@/components/VoiceControls";
import { useUndoToast } from "@/components/UndoToast";
import type {
  AdherenceProfile,
  AgentId,
  BaselineKind,
  CalendarEvent,
  CalendarMove,
  CheckIn,
  CheckInStatus,
  Citation,
  DayPlan,
  EvalResult,
  InterventionKind,
  Trip,
  WearableBaseline,
} from "@/domain/types";

function DayStepper({
  days,
  activeDaySpec,
  activeDayIndex,
  onSelectDay,
  todayIdx,
  currentDayName,
  currentLabel,
  totalSteps,
  completedCount,
  progressPct,
  previewMode,
  departureDayIndex,
}: {
  days: DaySpec[];
  activeDaySpec: DaySpec | undefined;
  activeDayIndex: number;
  onSelectDay: (label: string) => void;
  todayIdx: number | null;
  currentDayName: string;
  currentLabel: string;
  totalSteps: number;
  completedCount: number;
  progressPct: number;
  previewMode: boolean;
  departureDayIndex?: number;
}) {
  const [dayListOpen, setDayListOpen] = useState(false);
  // The day list dismisses like every other overlay: Escape closes it.
  useEffect(() => {
    if (!dayListOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDayListOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dayListOpen]);
  if (!(days.length > 0 && activeDaySpec)) return null;
  return (
    <div className="rise" style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <button
                type="button"
                aria-label="Previous day"
                disabled={activeDayIndex <= 0}
                onClick={() => days[activeDayIndex - 1] && onSelectDay(days[activeDayIndex - 1].label)}
                className="day-step"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setDayListOpen((v) => !v)}
                aria-expanded={dayListOpen}
                aria-current={todayIdx === activeDaySpec.dayIndex ? "date" : undefined}
                className="day"
                style={{ flex: 1 }}
              >
                <span style={{ display: "block" }}>
                  {currentDayName}
                  {todayIdx === activeDaySpec.dayIndex ? " · Today" : ""} ▾
                </span>
                {totalSteps > 0 && (
                  <span style={{ display: "block", marginTop: 4 }}>
                    <span style={{ display: "block", height: 3, borderRadius: 999, background: "var(--m-border-2)", overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${progressPct}%`, background: "#D96B43", transition: "width 0.3s ease-out" }} />
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: todayIdx === activeDaySpec.dayIndex ? "var(--m-on-accent)" : "var(--m-muted)" }}>
                      {previewMode ? `Example plan · ${completedCount} of ${totalSteps} done` : `${completedCount} of ${totalSteps} done`}
                    </span>
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label="Next day"
                disabled={activeDayIndex >= days.length - 1}
                onClick={() => days[activeDayIndex + 1] && onSelectDay(days[activeDayIndex + 1].label)}
                className="day-step"
              >
                ›
              </button>
            </div>
            {dayListOpen && (
              <>
              {/* Dismiss backdrop — taps outside the list close it, like
                  every other overlay in the app. */}
              <div
                aria-hidden="true"
                onClick={() => setDayListOpen(false)}
                style={{ position: "fixed", inset: 0, zIndex: "calc(var(--z-popover) - 1)" }}
              />
              <div className="card" style={{ position: "absolute", zIndex: "var(--z-popover)", top: "calc(100% + 4px)", left: 0, right: 0, padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                {days.map((d) => (
                  <button
                    key={d.dayIndex}
                    type="button"
                    onClick={() => { onSelectDay(d.label); setDayListOpen(false); }}
                    aria-current={todayIdx === d.dayIndex ? "date" : undefined}
                    className={`day ${d.label === currentLabel ? "on" : ""}`}
                    style={{ width: "100%", textAlign: "left" }}
                  >
                    {friendlyDayLabel(d, departureDayIndex)}
                    {todayIdx === d.dayIndex ? " · Today" : ""}
                  </button>
                ))}
              </div>
              </>
            )}
    </div>
  );
}

/** The crate-match card's pin (step 6): the suggestion nearest the selected
 *  day whose resolved choice is a real offer — suggested or kept, never a
 *  dismissed one. Module-level so the compiler can memo the call site. */
function pickInsightPin(
  itinerary: TasteItinerary | undefined,
  dayIndex: number,
  state: Parameters<typeof dayPlacePin>[2],
) {
  if (!itinerary) return null;
  const suggs = [...itinerary.suggestions].sort(
    (a, b) =>
      Math.abs(a.dayIndex - dayIndex) - Math.abs(b.dayIndex - dayIndex) ||
      a.dayIndex - b.dayIndex,
  );
  for (const s of suggs) {
    const r = dayPlacePin(itinerary, s.dayIndex, state);
    if (r && (r.status === "suggested" || r.status === "kept")) {
      return {
        placeName: r.place.name,
        category: r.place.categories[0],
        startMin: s.startMin,
        endMin: s.endMin,
        dayLabel: s.label,
        kept: r.status === "kept",
      };
    }
  }
  return null;
}

/* §4a — what a bare "why" on an insight card points at: the finding the
 *  card already states in prose. */
const INSIGHT_ASK_ABOUT: Record<InsightCardModel["id"], string> = {
  gap: "the body-clock gap card",
  conflict: "the conflict flag card",
  place: "the crate match card",
};

/** Which face the day panel wears (milestone 5): an edit session when the
 *  page can accept proposals (a saved locked plan, real trip — not the
 *  sample/preview), otherwise exploration-only. */
export function dayPanelMode({
  planEdit,
  sampleMode,
  lockedSize,
}: {
  planEdit: boolean;
  sampleMode: boolean;
  lockedSize: number;
}): "edit" | "explore" {
  return planEdit && !sampleMode && lockedSize > 0 ? "edit" : "explore";
}

export interface NudgeFeedScreenProps {
  trip: Trip | null;
  phase: "idle" | "running" | "done";
  selectedDayLabel: string;
  onSelectDay: (label: string) => void;
  /** Milestone 5: traveller-proposed edits. Present only when the page can
   *  accept them (a saved plan for this route); disabledReason freezes the
   *  affordance while a crew run is in flight. */
  planEdit?: {
    onPlansChanged: (plans: DayPlan[]) => void;
    disabledReason: string | null;
    isLocked: (dayIndex: number, ivIndex: number) => boolean;
    firstEditableDay: number | null;
  };
  locked: Map<string, DayPlan>;
  drafts: Map<string, { plan: DayPlan; attempt?: number; solverDraft?: DayPlan }>;
  /** Per-day scorer verdicts — the "why" expander's evidence row. */
  verdicts: Map<string, EvalResult[]>;
  /** Days rejected at least once before locking. */
  rejected: Set<string>;
  /** Latest graph-memory hop path the crew consulted — evidence row. */
  memoryPath?: string;
  /** Guided depth: open every "why" drawer without tapping. */
  expandAllWhy?: boolean;
  baseline?: WearableBaseline;
  calendarEvents: CalendarEvent[];
  moves: CalendarMove[];
  citations: Citation[];
  /** The traveller's compliance floor + adherence profile. Optional because
   *  `TripData.adherence` is itself optional at the caller (`page.tsx:43`), so
   *  the feed falls back to the fixture profile during the `/api/trip` window. */
  adherence?: AdherenceProfile;
  /** Re-run the crew with the skipped steps recorded as constraints. */
  onReplanConstraints?: (checkIns: CheckIn[], lastMarkedDayIndex: number) => void;
  /** "fixture" = the sample traveller's numbers. Shown on Today, not only in
   *  the setup sheet, so a first-time visitor knows the plan is sample data. */
  baselineSource?: "fixture" | "garmin";
  /** Provenance of those numbers. `demo-default` means nothing has been told to
   *  us yet, which is the one moment worth asking the wake question. */
  baselineKind?: BaselineKind;
  /** Self-reported natural wake. Set → the question retires and the preview
   *  re-plans around it; the numbers are still sample data underneath. */
  wakeBand?: WakeBand | null;
  onWakeBand?: (band: WakeBand | null) => void;
  /** Persisted prior runs for the B3 second-trip proof (Supabase-backed;
   *  empty without keys — the proof stays null, the honest first-trip
   *  state). Optional so callers without the read keep the current shape. */
  pastRuns?: { savedAt: string; trip?: { origin?: { code?: string }; destination?: { code?: string }; requiredShiftMin?: number; direction?: "east" | "west" } | null; score: number }[];
  onStartCrewSync: () => void;
  /** A mark coming from outside (notification tap / URL). Applied once the
   *  step is in `steps` — nonce retriggers the effect per mark. */
  externalMark?: { id: string; status: "done" | "skipped"; nonce: number } | null;
  /** Reminders toggle — owned by page.tsx, rendered in the next-up card when
   *  a plan exists. */
  remindersOn?: boolean;
  onToggleReminders?: () => void;
  remindersBlocked?: boolean;
  /** Feed syncs have failed repeatedly — the subscribed calendar is silently
   *  going stale. Rendered near the reminder toggle it sits next to. */
  feedStale?: boolean;
  onCancelRun?: () => void;
  runActiveAgent?: string | null;
  /** The crew's current step label while a run is live (e.g. "day 2 of 4"). */
  runActiveLabel?: string;
  /** 0–1 sun progress through the run — drives the stage's status ribbon. */
  runSunProgress?: number;
  /** Report what actually happened — per-step did/skip marks or one
   *  day-level verdict. `lastMarkedDayIndex` lets the replan resume the day
   *  after the checked day. */
  onCheckIn?: (checkIns: CheckIn[], lastMarkedDayIndex: number) => void;
  actions: TripActions;
  tasteProfile?: TripTaste;
  tasteItinerary?: TasteItinerary;
  canFitTaste?: boolean;
  placeChoices?: PlaceChoices;
  calendarSource?: "google" | "fixture";
  sampleMode?: boolean;
  /** The crew's account left by the commit that built this plan — the
   *  provenance chips quote its rows when present. Null on a URL restore,
   *  where the row derives only what the trip itself can prove and omits
   *  the rest (agent-native step 3). `startedAt` keys the day table's
   *  one-shot resolve (step 7). */
  crewAccount?: { rows: CrewAccountRow[]; startedAt?: number } | null;
  /** True only on the first feed mount after a commit — the account exists
   *  and every row has landed (`crewAccount != null && crewAccount.done` at
   *  the page). Gates the day table's staggered resolve: the calculation
   *  made visible once, then the table is ordinary DOM. URL-restored trips
   *  never set it — their table renders settled (agent-native step 7). */
  freshPlan?: boolean;
}

/** Nudge category → the intervention kind a did/skip mark refers to.
 *  Calendar/flight nudges record status + time but carry no kind — moving a
 *  meeting isn't a physiological ask. */
const CATEGORY_KIND: Partial<Record<NudgeCategory, InterventionKind>> = {
  sunlight: "light_exposure",
  run: "exercise",
  nutrition: "caffeine_cutoff",
  sleep: "sleep_window",
};

/* Step 7 — the RecordsTable law on the plan room's day table
   (docs/plan/agent-native.md): computed columns resolve row-by-row, and
   the calculation is made visible. Presentation pacing only — every value
   the mask reveals was already real before it ran. ~110ms is the
   reference's resolve cadence; the lead clears the section's own `.4s`
   rise so the stagger reads inside a settled frame. */
const RESOLVE_LEAD_MS = 340;
const RESOLVE_ROW_MS = 110;
const RESOLVE_TAIL_MS = 240;
/* Accounts whose stagger already ran (keyed on `crewAccount.startedAt` —
   unique per commit). A remount — the Now ⇄ The plan switch, another
   room's remount — must not replay; a new commit's new startedAt earns a
   new run. Module scope is deliberate: the record outlives the feed. */
const RESOLVE_PLAYED = new Set<number>();

export function NudgeFeedScreen({
  externalMark,
  trip,
  phase,
  selectedDayLabel,
  onSelectDay,
  planEdit,
  locked,
  drafts,
  verdicts,
  rejected,
  memoryPath,
  expandAllWhy,
  baseline,
  calendarEvents,
  moves,
  citations,
  adherence,
  onReplanConstraints,
  baselineSource,
  baselineKind,
  wakeBand,
  onWakeBand,
  pastRuns,
  onStartCrewSync,
  remindersOn,
  onToggleReminders,
  remindersBlocked,
  feedStale,
  onCancelRun,
  runActiveAgent,
  runActiveLabel,
  runSunProgress,
  onCheckIn,
  actions,
  tasteProfile,
  tasteItinerary,
  canFitTaste,
  placeChoices,
  calendarSource,
  sampleMode,
  crewAccount,
  freshPlan,
}: NudgeFeedScreenProps) {
  const effectiveAdherence = adherence ?? ADHERENCE_PROFILE;
  const { completedIds, skippedIds, pendingMarks, ready: actionsReady } = actions;
  /* museum-of-motion magnetic on the run's door (hover:fine only). */
  const planCtaRef = useMagnetic<HTMLButtonElement>({ strength: 0.22 });
  const [expandedWhyId, setExpandedWhyId] = useState<string | null>(null);
  const [showMissed, setShowMissed] = useState(false);
  const [heroWhyId, setHeroWhyId] = useState<string | null>(null);
  const [globeOpen, setGlobeOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const [celebrated, setCelebrated] = useState(false);
  // The wake ack is a this-session thank-you, not a permanent banner.
  const [wakeJustAnswered, setWakeJustAnswered] = useState(false);
  // "Got it" line lingers three seconds where the card was.
  const [wakeCollapsing, setWakeCollapsing] = useState(false);
  const { toast: undoToast, show: showUndo } = useUndoToast();
  /** First visit this browser: the stage gets its one-shot entrance — the
   *  dawn line crossing the frame once. Remembered so it never becomes
   *  decoration on every load. */
  const [firstVisit, setFirstVisit] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("meridian:visited")) {
        localStorage.setItem("meridian:visited", "1");
        /* Deferred a frame: the entrance animates from the painted stage
           rather than from a hydration-time state change. */
        const id = requestAnimationFrame(() => setFirstVisit(true));
        return () => cancelAnimationFrame(id);
      }
    } catch {
      /* storage unavailable — no ceremony */
    }
  }, []);
  const [swipe, setSwipe] = useState<{ id: string; dx: number } | null>(null);
  const swipeRef = useRef<{ id: string; x0: number; y0: number; vert: boolean } | null>(null);
  /* §4a — the feed-pin's ask fold, keyed on the suggestion's date so a day
   *  change closes the field rather than leave it answering for a pin that
   *  has moved on. */
  const [pinAskFor, setPinAskFor] = useState<string | null>(null);

  // Item 11 — while the numbers are the sample persona's, steps are a preview
  // rather than commitments. `isPreview` is B's contract (domain/preview.ts):
  // demo-default with the wake question unanswered, and unknown-kind (nothing
  // fetched yet) counts as preview so fixture numbers are never shown as
  // measured before provenance is known.
  const previewMode = isPreview(baselineKind, wakeBand);
  const tapsBecomeCheckIns = tapBecomesCheckIn(baselineKind, wakeBand);

  /** One tap on Done — records the mark on the Home-owned ledger and queues
   *  a structured check-in. Tapping again un-does both. On preview this is a
   *  dry run: nothing is written, nothing becomes a `CheckIn`. */
  const markDone = useCallback((s: TravelerNudge) => {
    if (!actionsReady) return;
    actions.mark(
      {
        id: s.id,
        dayIndex: s.dayIndex,
        kind: CATEGORY_KIND[s.category],
        startMin: s.startMin,
        text: `did: ${s.title}`,
        at: Date.now(),
      },
      "done",
    );
  }, [actions, actionsReady]);

  /** One tap on Skip — the adherence signal that matters most. Un-dones the
   *  step if it was marked done; tapping again un-skips. */
  const markSkipped = useCallback((s: TravelerNudge) => {
    if (!actionsReady) return;
    actions.mark(
      {
        id: s.id,
        dayIndex: s.dayIndex,
        kind: CATEGORY_KIND[s.category],
        startMin: s.startMin,
        text: `skipped: ${s.title}`,
        at: Date.now(),
      },
      "skipped",
    );
  }, [actions, actionsReady]);

  const isSkipped = (id: string) => skippedIds.has(id);

  /** Send every queued mark to the crew — they become the replan's check-in
   *  context. The queue clears once it's handed over; the marks themselves
   *  stay on the ledger so a skipped step stays skipped. */
  const sendPendingMarks = () => {
    if (!onCheckIn || pendingMarks.size === 0 || !tapsBecomeCheckIns) return;
    const marks = [...pendingMarks.values()];
    const last = Math.max(...marks.map((m) => m.dayIndex));
    const stamp = Date.now().toString(36);
    const checkIns: CheckIn[] = marks.map((m, i) => ({
      id: `ci-${stamp}-${i.toString(36)}`,
      dayIndex: m.dayIndex,
      kind: m.kind,
      startMin: m.startMin,
      status: m.status,
      text: m.text,
      at: m.at,
    }));
    onCheckIn(checkIns, last);
    actions.acknowledge(marks.map((m) => m.id));
  };

  const days = trip?.days ?? [];
  const activeDayIndex = Math.max(
    0,
    days.findIndex((d) => d.label === selectedDayLabel),
  );
  const activeDaySpec = days[activeDayIndex] ?? days[0];
  const currentLabel = activeDaySpec?.label ?? "D-2";
  const currentDayName = activeDaySpec
    ? friendlyDayLabel(activeDaySpec, trip?.departureDayIndex)
    : "Prep day";

  /** No per-step marks? The day-level verdicts still fire a check-in in one
   *  tap — "How did {day} go?" → did / partly / skipped. useCallback keeps the
   *  compiler treating it as an event handler (Date.now is render-impure). */
  const sendDayVerdict = useCallback(
    (status: CheckInStatus) => {
      if (!onCheckIn || !activeDaySpec || !tapsBecomeCheckIns) return;
      const now = Date.now();
      onCheckIn(
        [
          {
            id: `ci-${now.toString(36)}-day`,
            dayIndex: activeDaySpec.dayIndex,
            status,
            at: now,
          },
        ],
        activeDaySpec.dayIndex,
      );
    },
    [onCheckIn, activeDaySpec, tapsBecomeCheckIns],
  );

  // The city a step's time belongs to: origin-local through the flight day,
  // destination-local after it.
  const cityFor = (dayIndex: number) =>
    trip ? dayPlace(trip, dayIndex).city : "";

  // Solver-backed preview (PR 0 contract): what the crew would lock today,
  // without running the crew. Post-landing days and solver-infeasible days
  // are honestly null — the feed renders "not placed yet — personalise".
  const preview = useMemo(
    () =>
      trip
        ? previewPlan({
            trip,
            calendar: calendarEvents,
            adherence: effectiveAdherence,
            baseline,
          })
        : null,
    [trip, calendarEvents, effectiveAdherence, baseline],
  );

  // Days after the flight are always null in the preview — they're planned
  // after landing. What the pre-flight days banked shows as the residual.
  const isPostFlightDay =
    !!trip && !!activeDaySpec && activeDaySpec.dayIndex > trip.departureDayIndex;

  const landedResidualMin = useMemo(() => {
    let last: number | null = null;
    preview?.forEach((s) => {
      if (s?.result.coverage) last = s.result.coverage.residualMin;
    });
    return last;
  }, [preview]);
  const landedResidualHours =
    landedResidualMin !== null ? Math.round(landedResidualMin / 60) : null;

  // What the body still owes the destination — the gap the hero draws. Before a
  // run it is the preview chain's residual at landing; once the crew locks days
  // it is measured from the real plan, so the ghost curve closes as you go.
  const lockedDays = useMemo(() => [...locked.values()], [locked]);
  /* The sun-self keeps watch over the day: its face is the plan's own
   *  accounting — owed, banked, direction, lit rays per locked day. */
  const sunRead = useMemo(() => {
    if (!trip) return null;
    const delivered = lockedDays.reduce((s, d) => s + (d.shiftMin ?? 0), 0);
    return sunSelfRead({
      owedMin: Math.max(0, trip.requiredShiftMin - delivered),
      deliveredMin: delivered,
      requiredMin: trip.requiredShiftMin,
      direction: trip.direction,
      daysLocked: lockedDays.length,
    });
  }, [trip, lockedDays]);
  const dawnOwedMin = useMemo(() => {
    if (!trip) return 0;
    if (lockedDays.length) return coverageOf(trip, lockedDays).residualMin;
    return landedResidualMin ?? Math.abs(trip.requiredShiftMin);
  }, [trip, lockedDays, landedResidualMin]);
  // The stage's sky is the body clock's — live, so it drifts with the real sun.
  const liveDate = useLiveDate();

  // One view: the day as a rail, in the order you live it.
  const steps = useMemo(() => {
    if (!trip || !activeDaySpec) return [];
    const plan =
      locked.get(activeDaySpec.label) ??
      drafts.get(activeDaySpec.label)?.plan ??
      preview?.get(activeDaySpec.label)?.plan;
    const raw = buildDailyNudgesForDay({
      trip,
      dayIndex: activeDaySpec.dayIndex,
      plan,
      baseline,
      calendarEvents,
      moves,
      citations,
      verdicts: verdicts.get(activeDaySpec.label),
      dayRejected: rejected.has(activeDaySpec.label) || (verdicts.get(activeDaySpec.label) ?? []).some((v) => !v.feasible),
      memoryPath,
      adherence: effectiveAdherence,
      solverDraft: drafts.get(activeDaySpec.label)?.solverDraft,
    });
    return [...raw].sort((a, b) => a.startMin - b.startMin);
  }, [trip, activeDaySpec, locked, drafts, preview, baseline, calendarEvents, moves, citations, verdicts, rejected, memoryPath, effectiveAdherence]);

  // "Yesterday you did X of Y" — marks against the previous day's ids; null
  // when there's no previous day or it had no steps to mark.
  const yesterday = useMemo(() => {
    if (!trip || !activeDaySpec || activeDaySpec.dayIndex <= 0) return null;
    const prevSpec = trip.days.find((d) => d.dayIndex === activeDaySpec.dayIndex - 1);
    if (!prevSpec) return null;
    const plan =
      locked.get(prevSpec.label) ??
      drafts.get(prevSpec.label)?.plan ??
      preview?.get(prevSpec.label)?.plan;
    const ids = buildDailyNudgesForDay({
      trip,
      dayIndex: prevSpec.dayIndex,
      plan,
      baseline,
      calendarEvents,
      moves,
      citations,
      verdicts: verdicts.get(prevSpec.label),
      solverDraft: drafts.get(prevSpec.label)?.solverDraft,
      dayRejected: rejected.has(prevSpec.label),
      memoryPath,
      adherence: effectiveAdherence,
    }).map((n) => n.id);
    if (!ids.length) return null;
    return { done: ids.filter((id) => completedIds.has(id)).length, total: ids.length };
  }, [trip, activeDaySpec, locked, drafts, preview, baseline, calendarEvents, moves, citations, verdicts, rejected, memoryPath, effectiveAdherence, completedIds]);
  // Guided ribbon — the day's crew beats, distilled to one line. Only real
  // events, never reconstructed.
  const dayBeat = useMemo(() => {
    if (!expandAllWhy || !activeDaySpec) return null;
    const vs = verdicts.get(activeDaySpec.label) ?? [];
    if (!vs.length && !memoryPath) return null;
    const parts: string[] = [];
    const fails = vs.filter((v) => !v.feasible).length;
    const latest = vs.at(-1);
    if (locked.has(activeDaySpec.label) && latest) parts.push("Planned and checked");
    if (fails) parts.push(`revised ${fails} ${fails === 1 ? "time" : "times"} after a check`);
    if (memoryPath) parts.push("used what we learned from your past trips");
    return parts.length ? parts.join(" · ") : null;
  }, [expandAllWhy, activeDaySpec, verdicts, locked, memoryPath]);

  // "Your next step" — the first incomplete step by TIME, never by category
  // order. Windows whose end has passed collapse into "Missed". A day that
  // isn't today (at its own place — see dayPlace) has nothing missed.
  const nowDate = new Date();
  const isToday =
    !!trip &&
    !!activeDaySpec &&
    todayDayIndex(trip, nowDate) === activeDaySpec.dayIndex;
  const nowMin =
    trip && activeDaySpec && isToday
      ? nowMinOnDay(trip, activeDaySpec.dayIndex, new Date())
      : null;

  // `nowDate` (captured once above) is the clock to judge with — not
  // `nowMin`, which is null whenever the *selected* day isn't today, and
  // that is exactly the state a finished trip is always in. Judging on it
  // made the completion card unreachable.
  const tripFinished = isTripFinished(trip, nowDate);
  // Skipped counts as resolved: "I'm not doing this" should drop the step out
  // of the hero slot and the missed list, not keep nagging with it.
  const resolvedIds = useMemo(
    () => new Set([...completedIds, ...skippedIds]),
    [completedIds, skippedIds],
  );
  // Every Done/Skip is undoable — the toast's Undo is just the same toggle.
  const doneTap = useCallback(
    (st: TravelerNudge) => {
      if (window.matchMedia("(pointer: coarse)").matches) {
        navigator.vibrate?.(10);
      }
      const wasDone = completedIds.has(st.id);
      markDone(st);
      if (!wasDone) showUndo("Marked done", () => markDone(st));
    },
    [completedIds, markDone, showUndo],
  );
  const skipTap = useCallback(
    (st: TravelerNudge) => {
      const wasSkipped = skippedIds.has(st.id);
      markSkipped(st);
      if (!wasSkipped) showUndo("Skipped", () => markSkipped(st));
    },
    [skippedIds, markSkipped, showUndo],
  );
  // The day verdict is a report on a day that happened — asking "how did a
  // future day go" is unanswerable. When today isn't inside the trip at all
  // (null), the trip is either all ahead or all behind: `tripFinished` splits
  // the two, and only the behind case earns the question.
  const todayIdx = trip ? todayDayIndex(trip, nowDate) : null;
  // Past days ask whenever they're selected; today waits until 5pm — the day
  // isn't judgeable before the evening it was building towards. `nowMin` is
  // already null-safe above.
  const dayVerdictAllowed =
    !!activeDaySpec &&
    (todayIdx !== null
      ? activeDaySpec.dayIndex < todayIdx ||
        (activeDaySpec.dayIndex === todayIdx && (nowMin ?? 0) >= 17 * 60)
      : tripFinished);
  useEffect(() => {
    if (!externalMark) return;
    const step = steps.find((st) => st.id === externalMark.id);
    if (!step) return;
    const t = setTimeout(() => {
      if (externalMark.status === "done") markDone(step);
      else markSkipped(step);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalMark?.nonce, externalMark?.id, externalMark?.status, steps]);

  const { next: heroNudge, missed: missedNudges } = pickNextStep(
    steps,
    resolvedIds,
    nowMin,
  );
  // Only a light step has a beam for the panel to place on the curve.
  const heroBeam =
    heroNudge?.category === "sunlight"
      ? {
          dayIndex: heroNudge.dayIndex,
          startMin: heroNudge.startMin,
          endMin: heroNudge.endMin,
        }
      : null;
  const completedCount = steps.filter((n) => completedIds.has(n.id)).length;
  const totalSteps = steps.length;
  const progressPct = totalSteps
    ? Math.round((completedCount / totalSteps) * 100)
    : 0;
  // Glow once per calendar day when today's last step is marked done.
  useEffect(() => {
    if (!isToday || totalSteps === 0 || completedCount < totalSteps) return;
    const key = `meridian:celebrated:${new Date().toDateString()}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const t = setTimeout(() => setCelebrated(true), 0);
    return () => clearTimeout(t);
  }, [isToday, totalSteps, completedCount]);
  // The plan behind the day's steps, for the impact copy below.
  const activePlan = activeDaySpec
    ? (locked.get(activeDaySpec.label) ??
      drafts.get(activeDaySpec.label)?.plan ??
      preview?.get(activeDaySpec.label)?.plan)
    : undefined;
  // Impact in arrival units. A hold day (or a step with no shift behind it)
  // says what it does instead of "0 min".
  const impactCopy = (category: NudgeCategory, verb: "done" | "missed") => {
    const n = activePlan ? stepImpactMin(activePlan, category) : 0;
    if (n <= 0) return "helps keep your new schedule steady";
    const dest = trip?.destination.name ?? "your destination";
    return verb === "done"
      ? `your body clock moves about ${n} min closer to ${dest} time`
      : `skipping costs about ${n} min`;
  };
  // The done step's receipt (round 26): the PRC model gates whether this
  // step at this time actually supported the day's shift, and the share
  // numbers it. Only locked days earn a receipt — previews and draft days
  // fall back to the standing copy rather than invent attribution.
  const receiptFor = (step: TravelerNudge): string | null => {
    const plan = locked.get(step.dayLabel);
    if (!plan) return null;
    return stepReceipt({ plan, category: step.category, kind: step.kind, startMin: step.startMin }).text;
  };
  const doneWhere = isToday ? " today" : "";
  const countdown = (() => {
    if (!heroNudge || nowMin === null) return null;
    const until = heroNudge.startMin - nowMin;
    if (until > 0) {
      const h = Math.floor(until / 60);
      const m = until % 60;
      return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
    }
    const end =
      heroNudge.endMin < heroNudge.startMin
        ? heroNudge.endMin + 1440
        : heroNudge.endMin;
    return nowMin < end ? "now" : null;
  })();

  // Honest readiness: the share of the required shift the locked days cover
  // (sign-safe — eastbound shifts are negative). Pre-lock, the hero would
  // show 0% — which is wrong, because the solver has already drafted the
  // plan. B's `previewLockedOf` + `heroReadiness` (4090d7c) give the single
  // shared chain and its provenance: locked truth once anything has run,
  // the plan's promise before that, honest none when there is no plan.
  // The label branches on source so pre-lock never says "locked" about a
  // preview — the one trust gap round 3 left open.
  const previewLocked = useMemo(() => previewLockedOf(preview), [preview]);
  const readiness = trip
    ? heroReadiness(trip, [...locked.values()], previewLocked)
    : { pct: 0, source: "none" as const };
  const readinessPct = readiness.pct;
  // One obvious action: before a plan exists that's "Make my plan" (the next
  // step is a preview and stays secondary); afterwards the day's Done is the
  // primary and updating the plan drops to outline.
  const hasPlan = locked.size > 0;
  const scenePlans = useMemo(
    () =>
      locked.size
        ? [...locked.values()]
        : [...(preview?.values() ?? [])].flatMap((s) => (s ? [s.plan] : [])),
    [locked, preview],
  );
  const scene = useMemo(
    () =>
      trip && activeDaySpec
        ? buildDayScene({ trip, dayIndex: activeDaySpec.dayIndex, plans: scenePlans, calendar: calendarEvents, baseline })
        : null,
    [trip, activeDaySpec, scenePlans, calendarEvents, baseline],
  );

  const simple = !expandAllWhy;
  // HeroDawnPanel mounts under the same condition used in the hero below;
  // while mounted it is the single source of the hero's sky vars.
  const panelMounted = !!trip && (!simple || globeOpen);

  // Item 13 — the calendar is the compliance surface. The summary block sits
  // above the timeline so a traveller sees the numbers they will lock before
  // they see the steps they will follow: N movable / M fixed / K ready. The
  // readiness slice comes from the same `meetingReadiness` the hero names;
  // here it is reduced to a label that the summary block carries.
  const calSummary = useMemo(() => {
    if (!trip) return null;
    const readiness = meetingReadiness(
      trip,
      calendarEvents,
      [...locked.values()],
      baseline,
    ).map((r) => ({ status: r.status }));
    return calendarSummary(calendarEvents, readiness);
  }, [trip, calendarEvents, locked, baseline]);

  // Item 15 — the meeting is the product. The hero subhead names one real
  // fixed event with attendees (the trip's reason) and the body-time delta.
  // `null` when nothing post-flight is fixed; we render nothing rather than a
  // fixture title. Sequential: B's shape merges, then A renders.
  //
  // B added a `previewLocked` parameter to `heroMeeting` (7b6cc7d) so the
  // pre-lock sales line has content. We pass the solver-backed preview's
  // shiftMin chain as `previewLocked`; once anything is locked the preview
  // is ignored, and the hero falls back to the equal-values shape.
  const heroMtg = useMemo(() => {
    if (!trip) return null;
    const plans = locked.size
      ? [...locked.values()]
      : [...(preview?.values() ?? [])].flatMap((s) => (s ? [s.plan] : []));
    return performanceMoment({ trip, calendar: calendarEvents, plans, baseline });
  }, [trip, calendarEvents, locked, preview, baseline]);


  // B3 render — the retention loop made visible. `secondTripProof` reads the
  // persisted runs for the most recent prior trip on a different route;
  // null (no keys, no history, same route only) renders nothing rather than
  // an invented "crew remembers". Same-route rows are re-entries, not
  // journeys; corrupt rows are skipped by the contract, not here.
  const secondTrip = useMemo(() => {
    if (!trip || !pastRuns?.length) return null;
    return secondTripProof(pastRuns, {
      origin: trip.origin.code,
      destination: trip.destination.code,
    });
  }, [trip, pastRuns]);

  // Bet 2 — "spend your daylight here". Taste venues for the destination,
  // fetched once per trip from /api/taste (Qloo-backed; `{ enabled: false }`
  // without a key). Rendered only on the arrival day via `tasteStrip`;
  // null (no key, no places) renders nothing. Notes only — never scorer.
  const destName = trip?.destination.name;
  const destLon = trip?.destination.lon;
  const destLat = trip?.destination.lat;
  const destKey = destName !== undefined ? `${destName}:${destLon}:${destLat}` : null;
  const [taste, setTaste] = useState<{ key: string; data: TasteResponse } | null>(null);
  useEffect(() => {
    if (!destKey || destName === undefined || destLon === undefined || destLat === undefined) return;
    let cancelled = false;
    const controller = new AbortController();
    fetch(
      `/api/taste?city=${encodeURIComponent(destName)}&lon=${destLon}&lat=${destLat}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error("Taste unavailable");
        const d: unknown = await r.json();
        if (!isTasteResponse(d)) throw new Error("Invalid taste response");
        return d;
      })
      .then((d) => {
        if (!cancelled) setTaste({ key: destKey, data: d });
      })
      .catch(() => {
        if (!cancelled) {
          setTaste({ key: destKey, data: { enabled: true, destination: destName, places: [], note: "unavailable" } });
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [destKey, destName, destLon, destLat]);
  const tasteData: TasteResponse | null = taste && destKey && taste.key === destKey ? taste.data : null;
  const arrivalView =
    !expandAllWhy && !!trip && !!activeDaySpec &&
    activeDaySpec.dayIndex > trip.departureDayIndex && locked.has(activeDaySpec.label);
  const activeSceneIdea = useMemo(() => {
    const spec = arrivalView ? activeDaySpec : null;
    return spec && tasteItinerary
      ? (dayPlacePin(tasteItinerary, spec.dayIndex, placeChoices?.state ?? {}) ?? undefined)
      : undefined;
  }, [arrivalView, activeDaySpec, tasteItinerary, placeChoices?.state]);

  /* Step 7 — the day table draws its columns. A plan fresh from a commit
     doesn't appear fully formed: the rows' computed cells (window times,
     flag chips, the "why" drawer) resolve one staggered beat each while
     every row's gutter (the check, the date column — its identity) is
     already there. Decided once at mount: `freshPlan` is the account's
     own gate, the played-set kills replays on remount, reduced motion
     never mounts the mask — the settled table is its only state. */
  const planResolveKey =
    freshPlan && crewAccount?.startedAt != null ? crewAccount.startedAt : null;
  const [resolving, setResolving] = useState(
    () =>
      planResolveKey != null &&
      !RESOLVE_PLAYED.has(planResolveKey) &&
      !(
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ),
  );
  const [resolveTick, setResolveTick] = useState(0);
  /* Recorded in an effect, not the initializer — the mount itself is the
     run, and StrictMode's double init must not burn the account's one shot. */
  useEffect(() => {
    if (planResolveKey != null) RESOLVE_PLAYED.add(planResolveKey);
  }, [planResolveKey]);
  /* An OS motion change mid-run stands the mask down instantly. */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settle = () => {
      if (mq.matches) setResolving(false);
    };
    mq.addEventListener("change", settle);
    return () => mq.removeEventListener("change", settle);
  }, []);
  /* Rows the stagger owes: the rail's steps, or the arrival view's steps
     plus its place-idea row when one is live (suggested or kept — the
     same `active` the view computes). */
  const resolveRowCount = arrivalView
    ? steps.length +
      (activeSceneIdea &&
      (activeSceneIdea.status === "suggested" ||
        activeSceneIdea.status === "kept")
        ? 1
        : 0)
    : steps.length;
  /* A timeout chain, not an interval — mounted only while `resolving`
     lives and self-clearing: lead, then one row per beat, a short tail so
     the last fade lands, done. No timer is left running after it. */
  useEffect(() => {
    if (!resolving) return;
    if (resolveTick >= resolveRowCount) {
      const t = setTimeout(() => setResolving(false), RESOLVE_TAIL_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => setResolveTick((n) => n + 1),
      resolveTick === 0 ? RESOLVE_LEAD_MS : RESOLVE_ROW_MS,
    );
    return () => clearTimeout(t);
  }, [resolving, resolveTick, resolveRowCount]);

  /* Step 4 — the pin travels with the day. Whatever `resolvePlaceChoice`
     returns for the active spec is surfaced on the day's nudge card, so
     the crate's pick no longer lives only in the itinerary/arrival views.
     Gated off arrivalView only because that view already rows the same
     idea with its keep/swap controls — two pins on one day would read as
     two facts. */
  const dayPin = useMemo(() => {
    if (arrivalView || !activeDaySpec || !tasteItinerary) return null;
    const resolved = dayPlacePin(
      tasteItinerary,
      activeDaySpec.dayIndex,
      placeChoices?.state ?? {},
    );
    return resolved && (resolved.status === "suggested" || resolved.status === "kept")
      ? resolved
      : null;
  }, [arrivalView, activeDaySpec, tasteItinerary, placeChoices?.state]);

  /* Step 6 — the crate-match card's pin. The selected day first, then the
     nearest suggestion's day — a card exists only for a pin that resolves
     to a real offer (suggested or kept), never for a dismissed one. */
  const insightPin = useMemo(
    () =>
      pickInsightPin(
        tasteItinerary,
        activeDaySpec?.dayIndex ?? 0,
        placeChoices?.state ?? {},
      ),
    [tasteItinerary, activeDaySpec, placeChoices?.state],
  );

  /* Step 6 — the carousel's facts. `scenePlans` is the best plan set the
     surface has (locked first, else the solver's preview); `heroMtg` is
     the trip's marked event; the conflict scan runs the same evaluatePlan
     call the crew's rows count. */
  const insights = useMemo(
    () =>
      insightCards({
        trip,
        owedMin: dawnOwedMin,
        plans: scenePlans,
        plansArePreview: lockedDays.length === 0,
        moment: heroMtg,
        calendar: calendarEvents,
        adherence: effectiveAdherence,
        baseline,
        pin: insightPin,
        example: sampleMode === true,
        pinSample: tasteItinerary?.sampleSource,
      }),
    [
      trip,
      dawnOwedMin,
      scenePlans,
      lockedDays.length,
      heroMtg,
      calendarEvents,
      effectiveAdherence,
      baseline,
      insightPin,
      sampleMode,
      tasteItinerary?.sampleSource,
    ],
  );

  /* Step 3 — provenance chips under the stamped header. The account's
     rows are quoted when the commit left them; a URL restore derives the
     route facts from the trip and the crate from whatever taste state
     actually exists — the row names what IS known and drops the rest. */
  const provChips = useMemo(
    () =>
      provenanceChips({
        trip,
        accountRows: crewAccount?.rows ?? null,
        calendarCount: calendarEvents.length,
        calendarSource,
        crate: crewAccount
          ? null
          : tasteItinerary
            ? {
                entities: tasteItinerary.favorites.length,
                places: tasteItinerary.suggestions.length,
              }
            : tasteProfile?.ready
              ? { entities: tasteProfile.favorites.length }
              : null,
      }),
    [trip, crewAccount, calendarEvents.length, calendarSource, tasteItinerary, tasteProfile],
  );
  const provRow =
    provChips.length > 0 ? (
      <ul className="prov-chips" aria-label="Signals the plan used">
        {provChips.map((c) => (
          <li key={c.source} className="prov-chip">
            <span className="prov-chip-src">{c.source}</span>
            {c.detail}
          </li>
        ))}
      </ul>
    ) : null;

  /* §4a — the addressability layer. One deterministic lane every surface
     asks through: the facts are the same set the insight cards already
     consume (trip, owed, the best plan set, the gate's scan inputs, the
     crate count, the calendar tally) plus the attached context — a bare
     "why" answers for the card it sits on. Answers are composed from real
     state, never logged. */
  const askFacts = useMemo<CrewFacts>(
    () => ({
      trip,
      owedMin: dawnOwedMin,
      plans: scenePlans,
      plansArePreview: lockedDays.length === 0,
      activeDaySpec,
      calendar: calendarEvents,
      adherence: effectiveAdherence,
      baseline,
      moment: heroMtg
        ? {
            title: heroMtg.title,
            localMin: heroMtg.localMin,
            bodyMin: heroMtg.bodyMin,
            dayLabel: heroMtg.dayLabel,
          }
        : null,
      baselineFacts: baseline
        ? {
            chronotype: baseline.chronotype,
            bedMin: baseline.avgBedtimeMin,
            wakeMin: baseline.avgWakeMin,
            sleepMin: baseline.avgSleepMin,
          }
        : null,
      places: tasteItinerary
        ? {
            matched:
              tasteItinerary.suggestions.length +
              (tasteItinerary.firstNight ? 1 : 0),
            provenance: placeProvenance(tasteItinerary),
          }
        : null,
      citations: citations.length,
      moves: moves.length,
    }),
    [
      trip,
      dawnOwedMin,
      scenePlans,
      lockedDays.length,
      activeDaySpec,
      calendarEvents,
      effectiveAdherence,
      baseline,
      heroMtg,
      tasteItinerary,
      citations.length,
      moves.length,
    ],
  );

  /* §4a — the two nudge-side ask fields share the step's own reason as
     their bare-"why" context; `about` names the field's framing. The same
     facts JSON is the LLM lane's grounding when an open question falls
     through the intents. */
  const heroAskContext = (about: string): CrewAnswerContext | null =>
    heroNudge
      ? {
          about,
          detail: heroNudge.whyItHelps,
          owner: "Otto",
          agent: "planner" as AgentId | null,
          provenance: "the step's own reason",
        }
      : null;
  const nowAskFacts: CrewFacts = {
    ...askFacts,
    context: heroAskContext(
      heroNudge
        ? `your next step — ${fmtMin(heroNudge.startMin)} ${heroNudge.title}`
        : "the card on screen",
    ),
  };

  /* §4a — the pin's ask binds the suggestion's own fields (category, its
     window on the labelled day, the itinerary's provenance) so "why this
     place?" answers from what Scout actually matched — nothing else. */
  const pinAskFacts = useMemo<CrewFacts | null>(() => {
    if (!dayPin || !tasteItinerary) return null;
    const s = dayPin.suggestion;
    const cat = dayPin.place.categories[0];
    return {
      ...askFacts,
      context: {
        about: `${dayPin.place.name} — the crate's pick`,
        detail: `${cat ? `${cat}, ` : ""}inside your ${fmtMin(s.startMin)}–${fmtMin(s.endMin)} window on ${s.label} — ${placeProvenance(tasteItinerary)}`,
        owner: "Scout",
        agent: null,
        provenance: "your crate",
      },
    };
  }, [dayPin, tasteItinerary, askFacts]);

  /** The now-room's ask field — the judge-visible surface, first control
   *  under the provenance chips. A bare "why" here answers for the card
   *  the room is showing: the next step. */
  const askCrewField = trip ? (
    <CrewAsk
      label="Ask the crew"
      placeholder="Ask the crew — type a question"
      live
      owner="Otto"
      agent="planner"
      facts={nowAskFacts}
      onAsk={(q) => crewAnswer(q, nowAskFacts)}
    />
  ) : null;
  const provChildren = (
    <>
      {provRow}
      {askCrewField}
    </>
  );

    const shareCard = scene && (
    <DayCardShare
      scene={scene}
      fictionalTrip={sampleMode === true}
      eventSource={calendarSource ?? "fixture"}
      exampleBaseline={baselineKind === "demo-default" && !wakeBand}
      preview={!locked.has(currentLabel)}
      idea={activeSceneIdea}
      favorites={tasteItinerary?.favorites}
      recordedTaste={false}
      staleTaste={
        !!(tasteProfile?.ready && tasteItinerary &&
          tasteSelectionKey(tasteProfile.favorites) !== tasteSelectionKey(tasteItinerary.favorites))
      }
    />
  );
  const canEditPlan =
    dayPanelMode({ planEdit: !!planEdit, sampleMode: sampleMode === true, lockedSize: locked.size }) === "edit";
  const editStore = useMemo(
    () =>
      canEditPlan && trip
        ? localPlanStore({
            route: {
              origin: trip.origin.code,
              dest: trip.destination.code,
              date: trip.days.find((d) => d.dayIndex === trip.departureDayIndex)?.date ?? "",
            },
          })
        : null,
    [canEditPlan, trip],
  );
  const stepperProps = {
    days,
    activeDaySpec,
    activeDayIndex,
    onSelectDay,
    todayIdx,
    currentDayName,
    currentLabel,
    totalSteps,
    completedCount,
    progressPct,
    previewMode,
    departureDayIndex: trip?.departureDayIndex,
  };

  // Altitudes: the feed's shared sky context. Each room's keyframe is a
  // perturbation of the stage's modeled moment (src/domain/feed-scenes.ts),
  // so every painted value is real state — owed, coverage, the scouts' arc.
  const roomCtx = useMemo<RoomCtx | null>(() => {
    if (!trip) return null;
    const vars = stageSkyFor(trip, dawnOwedMin, liveDate) as Record<string, string>;
    const req = Math.max(1, Math.abs(trip.requiredShiftMin));
    const glow = sunRead?.glow ?? Math.max(0, 1 - dawnOwedMin / req);
    return {
      // The canvas box is filled in by FeedWorld at paint time.
      w: 0,
      h: 0,
      hor: cssRgb(vars["--stage-horizon"], [0.91, 0.6, 0.44]),
      zen: cssRgb(vars["--stage-ink-2"], [0.047, 0.07, 0.125]),
      horH0: (parseFloat(vars["--stage-horizon-h"] ?? "26") || 26) / 100,
      starO: parseFloat(vars["--stage-star-o"] ?? "0") || 0,
      owedFrac: Math.min(1, Math.max(0, dawnOwedMin / req)),
      glow,
      scouts: [0.12, 0.2, 0.09, 0.16, 0.06].map((f) => Math.min(0.97, glow + f)),
      // The route's day markers: locked lit, preview half-lit, nothing dark.
      days: trip.days.map((d) => ({
        lit: locked.has(d.label) ? 1 : preview?.get(d.label)?.plan ? 0.5 : 0,
      })),
      // The altimeter chip's body-clock read — the same clock the sky keys
      // on (the render's `nowMin` rides `new Date()`, which the compiler
      // can't preserve as a dep; liveDate is the reactive equivalent).
      // Undefined until mounted or when the selected day isn't today, so
      // the chip shows its index and label alone.
      nowMin: (() => {
        const spec =
          trip.days[
            Math.max(0, trip.days.findIndex((d) => d.label === selectedDayLabel))
          ] ?? trip.days[0];
        return liveDate && spec && todayDayIndex(trip, liveDate) === spec.dayIndex
          ? nowMinOnDay(trip, spec.dayIndex, liveDate)
          : undefined;
      })(),
    };
  }, [trip, dawnOwedMin, liveDate, sunRead, locked, preview, selectedDayLabel]);

  /* The destination panels — the arrival view rides the plan room while the
     itinerary card stays with the next room, matching their original spots. */
  const tastePanels = (() => {
    const spec = arrivalView ? activeDaySpec : null;
    const resolved =
      spec && tasteItinerary
        ? (dayPlacePin(tasteItinerary, spec.dayIndex, placeChoices?.state ?? {}) ?? undefined)
        : undefined;
    const interactive = !tripFinished && tapsBecomeCheckIns;
    const writeChoice = (status: "kept" | "dismissed" | "swapped", place: DestinationPlace) => {
      if (!spec || !tasteItinerary || !resolved || !placeChoices) return;
      placeChoices.setChoice(spec.date, { status, place, tasteKey: tasteSelectionKey(tasteItinerary.favorites) });
      if (placeChoices.storageAvailable) {
        postTasteSignal(status, place);
        recordTasteSignal(localStorage, status, place);
      }
    };
    return {
      arrival:
        arrivalView && spec && trip ? (
          <ArrivalDayView
            destination={trip.destination.name}
            date={spec.date}
            steps={steps}
            idea={resolved}
            completedIds={completedIds}
            skippedIds={skippedIds}
            actionsReady={actionsReady}
            interactive={interactive}
            onDone={doneTap}
            onSkip={skipTap}
            onKeep={() => {
              if (!resolved || !placeChoices) return;
              writeChoice(resolved.status === "kept" ? "swapped" : "kept", resolved.place);
            }}
            onSwap={() => {
              if (!resolved || !placeChoices || !resolved.alternatives.length) return;
              writeChoice("swapped", resolved.alternatives[0]);
            }}
            onDismiss={() => {
              if (!resolved || !placeChoices) return;
              writeChoice("dismissed", resolved.place);
            }}
            onRestore={() => placeChoices?.clearChoice(spec.date)}
            choicesReady={placeChoices?.ready ?? false}
            storageAvailable={placeChoices?.storageAvailable ?? false}
            planning={phase === "running"}
            example={tasteItinerary?.planningMode === "replay"}
            tasteFavorites={tasteItinerary?.favorites}
            favoritesChanged={
              !!(tasteItinerary && tasteProfile?.ready &&
                tasteSelectionKey(tasteProfile.favorites) !== tasteSelectionKey(tasteItinerary.favorites))
            }
            tasteStatus={tasteItinerary?.status}
            ideaSource={tasteItinerary?.sampleSource}
            /* Step 7 — the same staggered resolve the rail gets. */
            resolveTick={resolving ? resolveTick : null}
            /* The evening idea belongs to the night of the arrival day —
             * it is offered, never scheduled, and only lands on the day
             * it actually describes. */
            firstNight={
              tasteItinerary && trip && spec && spec.dayIndex === trip.departureDayIndex + 1
                ? tasteItinerary.firstNight
                : undefined
            }
            onUpdatePlan={canFitTaste ? onStartCrewSync : undefined}
            updateDisabled={phase === "running" || (tasteProfile ? !tasteProfile.ready : false)}
          />
        ) : null,
      itinerary:
        !(arrivalView && spec && trip) && trip && tasteItinerary ? (
          <TasteItineraryCard
            itinerary={tasteItinerary}
            favorites={tasteProfile?.ready ? tasteProfile.favorites : undefined}
            onSelectDay={onSelectDay}
            onUpdate={canFitTaste ? onStartCrewSync : undefined}
            planning={phase === "running" || (tasteProfile ? !tasteProfile.ready : false)}
            choices={placeChoices?.state}
          />
        ) : null,
    };
  })();

  return (
    <>
      <FeedWorld ctx={roomCtx}>
      {/* Room: now — the same moment as the stage, one camera step down. */}
      <Room id="now">
      <RightNowCard
        step={heroNudge ?? null}
        nowMin={nowMin}
        isToday={todayIdx === activeDaySpec?.dayIndex}
        selectedDayLabel={activeDaySpec?.label ?? ""}
        countdown={countdown}
        isDone={heroNudge ? completedIds.has(heroNudge.id) : false}
        isSkip={heroNudge ? isSkipped(heroNudge.id) : false}
        onDone={heroNudge ? () => doneTap(heroNudge) : undefined}
        onSkip={heroNudge ? () => skipTap(heroNudge) : undefined}
        totalSteps={totalSteps}
        completedCount={completedCount}
      />
      {expandAllWhy || !scene ? (
        <PerformanceBrief
          moment={heroMtg}
          destination={trip?.destination.name ?? ""}
          date={days.find((d) => d.label === heroMtg?.dayLabel)?.date}
          example={calendarSource !== "google"}
          exampleBaseline={baselineKind === "demo-default" && !wakeBand}
          eventSource={calendarSource ?? "fixture"}
          preview={locked.size === 0}
          hasPlan={hasPlan || [...(preview?.values() ?? [])].some(Boolean)}
        >
          {provChildren}
        </PerformanceBrief>
      ) : (
        <PerformanceBrief
          compact
          moment={scene.moment}
          destination={scene.destination}
          date={scene.momentDate ?? undefined}
          example={sampleMode === true}
          exampleBaseline={baselineKind === "demo-default" && !wakeBand}
          eventSource={calendarSource ?? "fixture"}
          preview={!locked.has(currentLabel)}
          hasPlan={hasPlan || [...(preview?.values() ?? [])].some(Boolean)}
        >
          {provChildren}
        </PerformanceBrief>
      )}
      </Room>

      {/* Room: day — the day as ground; the instrument screen keeps its own
          framed sky (a monitor inside the slab, not a second horizon). */}
      {!expandAllWhy && scene && (
      <Room id="day">
        <div key={`${scene.city.code}:${scene.date}:${scene.moment?.eventId ?? ""}:${scene.moment?.localMin ?? ""}`}>
          {canEditPlan && editStore && trip ? (
            <InteractiveDayEditor
              ctxBase={{
                trip,
                calendar: calendarEvents,
                adherence: adherence ?? ADHERENCE_PROFILE,
                baseline: baseline
                  ? { avgBedtimeMin: baseline.avgBedtimeMin, avgWakeMin: baseline.avgWakeMin }
                  : undefined,
                citations,
                isLocked: planEdit!.isLocked,
                firstEditableDay: planEdit!.disabledReason ? -1 : planEdit!.firstEditableDay,
              }}
              baseline={baseline}
              dayIndex={activeDaySpec!.dayIndex}
              requiredMin={Math.abs(trip.requiredShiftMin)}
              direction={trip.direction}
              store={editStore}
              preview={!locked.has(currentLabel)}
              example={sampleMode === true}
              onPlansChanged={planEdit!.onPlansChanged}
              onJumpToMomentDay={
                scene.moment && scene.momentDayIndex !== scene.dayIndex
                  ? () => onSelectDay(scene.moment!.dayLabel)
                  : undefined
              }
            >
              {shareCard}
            </InteractiveDayEditor>
          ) : (
            <InteractiveDay
              scene={scene}
              requiredMin={Math.abs(trip!.requiredShiftMin)}
              direction={trip!.direction}
              editBlockReason={planEdit?.disabledReason ?? undefined}
              preview={!locked.has(currentLabel)}
              example={sampleMode === true}
              onJumpToMomentDay={
                scene.moment && scene.momentDayIndex !== scene.dayIndex
                  ? () => onSelectDay(scene.moment!.dayLabel)
                  : undefined
              }
            >
              {shareCard}
            </InteractiveDay>
          )}
        </div>
      </Room>
      )}

      {/* Room: next — the sun pushed toward; the hero and the day's
          surrounding instruments ride this slab until the rail. */}
      <Room id="next">
      {/* Split-Horizon Hero Card — the left panel is the trip's real dawn line:
          body clock against destination, with the next light window on it. */}
      <div
        className={`hero rise${simple && !globeOpen ? " slim" : ""}${firstVisit ? " first-visit" : ""}`}
        style={{
          animationDelay: ".2s",
          // While the dawn panel is mounted it owns the stage's sky vars
          // (imperatively, off its scrub state) — React must not also write
          // them or every re-render would clobber the panel's values.
          ...(panelMounted ? {} : stageSkyFor(trip, dawnOwedMin, trip ? liveDate : null)),
        }}
      >
        {/* the modeled darkness behind the hero — same stars the stage and
            arrival hang, riding --stage-star-o with the rest of the sky */}
        <StageStars seed={`hero-${trip?.destination.name ?? "meridian"}`} />
        {panelMounted && (
          <HeroDawnPanel
            trip={trip}
            owedMin={dawnOwedMin}
            beam={heroBeam}
            readinessPct={readinessPct}
            readinessSource={readiness.source}
          />
        )}

        {/* The card's right half. These two were siblings of HeroDawnPanel, so
            in a two-column grid the demo tag took cell (1,2) — an empty cream
            box — and "your next step" wrapped to (2,1), orphaned below the fold
            at half width. One wrapper, two grid children. */}
        <div className="hr-col">
          {/* The run is the product's deepest move, so the stage carries it:
              who is speaking, how many days are locked, and the sun's
              progress through the shift. Visual only — RunAnnouncer already
              announces the run for screen readers. */}
          {phase === "running" && (
            <div className="stage-run">
              <span className="stage-run-dot" aria-hidden="true" />
              <div className="stage-run-body">
                <p className="stage-run-label">
                  {runActiveLabel ?? "The crew is planning your shift"}
                </p>
                <span className="stage-run-meta">
                  {locked.size} of {trip?.days.length ?? 0} days locked
                </span>
              </div>
              <div className="stage-run-bar" aria-hidden="true">
                <i style={{ width: `${Math.round((runSunProgress ?? 0) * 100)}%` }} />
              </div>
            </div>
          )}

          {/* One frame, not six hedges. When the wake question is live
              (demo-default, unanswered), it carries the example-plan framing
              itself — the separate tag is dropped so there is one decision
              point, not two. Other fixture states keep their own tag. Garmin
              never shows one: the numbers were already theirs. */}
          {baselineSource === "fixture" &&
            !(baselineKind === "demo-default" && !wakeBand && onWakeBand) && (
              <p className="demo-tag">
                {baselineKind === "demo-default" && !wakeBand
                  ? "Example traveller — not your measurements."
                  : "Sleep and heart data are examples until you connect a wearable."}
              </p>
            )}

          {/* After an answer: the card collapses and this line shows for 3s
              in its place. wakeAck stays for other surfaces. */}
          {wakeJustAnswered && (
            <p className="demo-tag" style={{ borderColor: "#cfe3d4" }}>
              Got it — the plan now fits your mornings.
            </p>
          )}

          {/* Vision Rule 1, on the stage: the one question sits directly in
              the action column, beside the numbers it changes, rather than
              floating above the band. It retires once answered. */}
          {(wakeCollapsing ||
            (baselineKind === "demo-default" && !wakeBand && onWakeBand)) && (
            <div className={`ask${wakeCollapsing ? " collapsing" : ""}`} role="group" aria-label="Your natural wake time">
              <p className="ask-title">Make this plan yours</p>
              <p>On a day with nothing early planned, when do you naturally wake?</p>
              <div className="ask-chips">
                {([
                  ["before6", "Before 6"],
                  ["6to8", "6–8"],
                  ["after8", "After 8"],
                ] as const).map(([band, label]) => (
                  <button
                    key={band}
                    type="button"
                    className="ask-chip"
                    onClick={() => {
                      setWakeCollapsing(true);
                      setWakeJustAnswered(true);
                      setTimeout(() => setWakeCollapsing(false), 280);
                      setTimeout(() => setWakeJustAnswered(false), 3000);
                      onWakeBand?.(band);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* Item 14 — the solver holds a compliance floor (`floor - 105min`
                  in circadian.ts) and tries at/after-floor light first, but
                  nothing on the surface said so. An ask at exactly the floor
                  reads as the run-up to a 05:30 request tomorrow; naming the
                  promise is the difference between a promise and a threat.
                  Evenings are where an eastward trip is actually won. */}
              <p className="ask-foot">
                Nothing&apos;s scheduled before then — until you answer, this is an example.
              </p>
            </div>
          )}

          {/* B3 — the crew remembers. One line under the wake answer, same
              tag treatment; null proofs render nothing. */}
          {secondTrip ? (
            <p className="demo-tag" style={{ borderColor: "var(--m-border)" }}>
              {secondTripCopy(secondTrip)}
            </p>
          ) : null}

          {/* Vision Rule 1: one question, at the moment it first matters. The
              demo trip still renders immediately — but the tag above admits the
              numbers are invented, so this is where the one real answer belongs.
              `/api/trip` can't report a `wake-band` kind because it never sees
              `wake`; the band is applied client-side via resolveBaseline, which
              means answering re-plans the preview instantly with no refetch. */}

          <div className={`hr${celebrated ? " celebrate" : ""}`}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10 }}>
            <div className="badge">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="4" fill="#fff" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
              </svg>
            </div>
            <div>
              <div className="mini" key={heroNudge?.id}>
                {previewMode && <span className="preview-pill">Preview</span>}
                Next up · {heroNudge ? `${fmtMin(heroNudge.startMin)} ${cityFor(heroNudge.dayIndex)}` : ""}
                {countdown ? ` · ${countdown}` : ""}
                {!isToday ? ` · ${currentDayName}` : ""}
              </div>
            </div>
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
              {hasPlan && onToggleReminders && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!remindersOn}
                  aria-label="Remind me at each step"
                  title="Remind me at each step — as notifications on this device."
                  onClick={onToggleReminders}
                  className="icon-btn"
                  style={remindersOn ? { color: "#D96B43", borderColor: "#D96B43" } : undefined}
                >
                  {remindersOn ? <BellRing size={16} /> : <Bell size={16} />}
                </button>
              )}
              <VoiceControls
                compact
                nextStep={heroNudge && !tripFinished ? {
                  time: `${countdown ? `${countdown} · ` : ""}${fmtMin(heroNudge.startMin)}`,
                  city: cityFor(heroNudge.dayIndex),
                  title: heroNudge.title,
                  actionSummary: heroNudge.actionSummary,
                } : null}
                todaySteps={steps
                  .filter((st) => !resolvedIds.has(st.id))
                  .map((st) => ({ time: fmtMin(st.startMin), title: st.title }))}
                yesterday={yesterday}
                bedAt={activePlan ? fmtMin(activePlan.targetBedtimeMin) : null}
                onDone={heroNudge ? () => doneTap(heroNudge) : undefined}
              />
            </div>
          </div>
          {remindersBlocked && (
            <p className="warn-ink" style={{ margin: "4px 0 0", fontSize: 11 }}>
              Notifications are blocked in your browser settings.
            </p>
          )}
          {feedStale && (
            <p className="warn-ink" style={{ margin: "4px 0 0", fontSize: 11 }}>
              Your calendar stopped syncing — run the crew again to push the latest plan.
            </p>
          )}

          {totalSteps === 0 ? (
            isPostFlightDay ? (
              <>
                <h2>We&apos;ll plan this day after you land</h2>
                <p className="s">
                  The days before your flight do what they can
                  {landedResidualHours !== null &&
                    ` — you'll land about ${landedResidualHours}h off ${trip?.destination.name ?? "your destination"} time`}
                  , and we&apos;ll finish the plan once you&apos;re there.
                </p>
              </>
            ) : (
              <>
                <h2>No steps for this day yet</h2>
                <p className="s">
                  Make your plan and we&apos;ll fill in this day.
                </p>
              </>
            )
          ) : heroNudge ? (
            <>
              {/* The trip is over: stop offering steps and point at the score.
                  This is where "Land at 100%" actually gets cashed, and it is
                  the one moment the journey was building toward. */}
              {tripFinished && (
                <div className="arrival-nudge">
                  <span className="tw">Trip complete</span>
                  <h2>How did it go?</h2>
                  <p className="s">
                    Your plan is finished. See how well your body clock
                    adjusted, then tell us how you felt — it makes your next
                    plan better.
                  </p>
                  <div className="arrival-nudge-btns">
                    <a
                      className="p1"
                      href={`/arrival?origin=${trip?.origin.code ?? ""}&dest=${trip?.destination.code ?? ""}&date=${trip?.days.find((d) => d.dayIndex === trip.departureDayIndex)?.date ?? ""}`}
                    >
                      See results
                    </a>
                    <a className="p2" href="/outcome">
                      Tell us how you felt
                    </a>
                  </div>
                </div>
              )}
              {/* Past the last planned day the step itself is wrong advice —
                  there is no next step, so the countdown and the Done button
                  would both be fiction. The completion card above replaces the
                  lot. */}
              {!tripFinished && (
                <>
                  <span className="tw now-line">
                    {countdown ?? ""}
                    {countdown ? " · " : ""}
                    {fmtMin(heroNudge.startMin)} · {cityFor(heroNudge.dayIndex)} local time
                  </span>
                  <div key={heroNudge.id} className="nudge-in" data-cat={heroNudge.category}>
                  <h2>
                    <span className="tl-glyph" aria-hidden="true">
                      {(() => {
                        const HeroIcon = CAT_ICON[heroNudge.category];
                        return <HeroIcon size={15} strokeWidth={2.4} />;
                      })()}
                    </span>
                    {heroNudge.title}
                  </h2>
                  <p className="s">{heroNudge.actionSummary}</p>
                </div>
                  {expandAllWhy || heroWhyId === heroNudge.id ? (
                    <div className="drawer rise">
                      <b>Why this helps</b>
                      <p>{heroNudge.whyItHelps}</p>
                      {/* §4a — the card is askable once its why is open: a
                          bare "why" auto-answers for this nudge, times and
                          what-ifs run the deterministic lane. */}
                      <CrewAsk
                        label="Ask Otto"
                        placeholder="why is it at that time?"
                        live
                        owner="Otto"
                        agent="planner"
                        facts={{
                          ...askFacts,
                          context: heroAskContext(
                            `the ${fmtMin(heroNudge.startMin)} ${heroNudge.title} step`,
                          ),
                        }}
                        onAsk={(q) =>
                          crewAnswer(q, {
                            ...askFacts,
                            context: heroAskContext(
                              `the ${fmtMin(heroNudge.startMin)} ${heroNudge.title} step`,
                            ),
                          })
                        }
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="tl-why"
                      aria-expanded={false}
                      onClick={() => setHeroWhyId(heroNudge.id)}
                      style={{ alignSelf: "flex-start" }}
                    >
                      Why?
                    </button>
                  )}
                </>
              )}
              <div style={{ display: tripFinished ? "none" : "flex", gap: 10, alignItems: "center", marginTop: "2px" }}>
                <button
                  type="button"
                  onClick={() => doneTap(heroNudge)}
                  aria-pressed={completedIds.has(heroNudge.id)}
                  style={{
                    alignSelf: "flex-start",
                    background: hasPlan
                      ? "linear-gradient(90deg, #D96B43, #e99a6f)"
                      : "transparent",
                    color: hasPlan ? "var(--m-on-accent)" : "var(--color-paper)",
                    border: hasPlan ? "none" : "1.5px solid #D96B43",
                    borderRadius: "999px",
                    padding: "10px 22px",
                    minHeight: "44px",
                    fontSize: "13px",
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    cursor: "pointer",
                  }}
                >
                  {completedIds.has(heroNudge.id) ? "Done ✓" : "Done"}
                </button>
                <button
                  type="button"
                  onClick={() => markSkipped(heroNudge)}
                  aria-pressed={isSkipped(heroNudge.id)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--color-line)",
                    color: "var(--color-mist)",
                    borderRadius: "999px",
                    padding: "10px 18px",
                    fontSize: "12px",
                    fontWeight: 800,
                    letterSpacing: "0.03em",
                    cursor: "pointer",
                  }}
                >
                  {isSkipped(heroNudge.id) ? "Skipped ✓" : "Skip"}
                </button>
              </div>
              {completedIds.has(heroNudge.id) && (
                <p style={{ margin: 0, fontSize: "12px", color: "var(--color-mist)" }}>
                  {previewMode ? (
                    <>Done — {impactCopy(heroNudge.category, "done")}.</>
                  ) : receiptFor(heroNudge) ? (
                    <>
                      Done — {receiptFor(heroNudge)}
                      {pendingMarks.has(heroNudge.id) ? " · saved for your next check-in" : ""}.
                    </>
                  ) : (
                    <>
                      Done — {impactCopy(heroNudge.category, "done")}
                      {pendingMarks.has(heroNudge.id) ? " · saved for your next check-in" : ""}.
                    </>
                  )}
                </p>
              )}
              {isSkipped(heroNudge.id) && (
                <div className="tl-recovery-tip">
                  <p className="tl-recovery-header">Skipped · Recovery suggestion</p>
                  <p className="tl-recovery-body">
                    {recoveryTip(heroNudge.category, heroNudge.title)}
                  </p>
                  {!previewMode && (
                    <span className="tl-recovery-note">
                      Impact: {impactCopy(heroNudge.category, "missed")} · Saved for check-in.
                    </span>
                  )}
                </div>
              )}
              {missedNudges.length > 0 && (
                <div style={{ width: "100%" }}>
                  <button
                    type="button"
                    onClick={() => setShowMissed((v) => !v)}
                    aria-expanded={showMissed}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "var(--m-muted)",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    Missed ({missedNudges.length}) {showMissed ? "▲" : "▼"}
                  </button>
                  {showMissed && (
                    <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
                      {missedNudges.map((m) => (
                        <li
                          key={m.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: "10px",
                            padding: "6px 0",
                            borderTop: "1px solid var(--m-border-2)",
                            fontSize: "12px",
                            color: "var(--m-muted)",
                          }}
                        >
                          <span>
                            {fmtMin(m.startMin)} {cityFor(m.dayIndex)} · {m.title}
                            <span style={{ display: "block", fontSize: "11px" }}>
                              {impactCopy(m.category, "missed")}
                            </span>
                          </span>
                          <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={() => markDone(m)}
                              style={{
                                background: "transparent",
                                border: "1px solid var(--m-border)",
                                borderRadius: 999,
                                padding: "3px 10px",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "var(--m-text)",
                                cursor: "pointer",
                              }}
                            >
                              Done
                            </button>
                            <button
                              type="button"
                              onClick={() => markSkipped(m)}
                              style={{
                                background: "transparent",
                                border: "1px solid var(--m-border)",
                                borderRadius: 999,
                                padding: "3px 10px",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "var(--m-muted)",
                                cursor: "pointer",
                              }}
                            >
                              Skip
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h2>All done{doneWhere} ✓</h2>
              <p className="s">
                Nice work. Stick to tonight&apos;s bedtime and you&apos;re on track.
              </p>
            </>
          )}

          {/* Step 4 — the pinned place rides the day's card, not only the
              itinerary. One quiet line: the resolved place and where it
              came from. The tag never claims a live lookup — "your crate"
              is the favorites the traveller actually packed. */}
          {dayPin && (
            <>
            <p className="feed-pin">
              <MapPin size={13} className="feed-pin-ic" aria-hidden="true" />
              <span className="feed-pin-name">{dayPin.place.name}</span>
              <span className="feed-pin-tag">
                from your crate{dayPin.status === "kept" ? " · kept" : ""}
              </span>
              {/* §4a — the pin is askable: the fold binds the suggestion's
                  own fields so "why this place?" answers from what Scout
                  actually matched. */}
              <button
                type="button"
                className="feed-pin-ask"
                aria-expanded={pinAskFor === dayPin.suggestion.date}
                onClick={() =>
                  setPinAskFor((v) =>
                    v === dayPin.suggestion.date ? null : dayPin.suggestion.date,
                  )
                }
              >
                Ask Scout
              </button>
            </p>
            {pinAskFor === dayPin.suggestion.date && pinAskFacts && (
              <CrewAsk
                label="Ask Scout"
                placeholder="why this place?"
                live
                owner="Scout"
                agent={null}
                facts={pinAskFacts}
                onAsk={(q) => crewAnswer(q, pinAskFacts)}
              />
            )}
            </>
          )}

          {/* No meter on a preview — "0 of 5 done" over invented steps is a
              progress bar on someone else's day. Progress means yours. */}
          {totalSteps > 0 && !previewMode && (
            <div className="meter">
              <div className="t">
                {completedCount} of {totalSteps} done{doneWhere}
              </div>
              <div className="bar">
                <i style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          {phase === "running" && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ height: 3, borderRadius: 999, background: "var(--m-border-2)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: "30%", background: "#D96B43", animation: "skel-shimmer 1.2s ease-in-out infinite" }} />
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--m-muted)" }}>
                {(() => {
                  const a = runActiveAgent;
                  if (a === "analyst") return "Reading your sleep pattern…";
                  if (a === "researcher") return "Finding the research…";
                  if (a === "planner") return `Planning ${currentDayName}…`;
                  if (a === "evaluator") return "Checking the plan…";
                  if (a === "negotiator") return "Fitting it around your calendar…";
                  return "Building your plan…";
                })()}{" "}
                · {locked.size} of {days.length} days ready
              </p>
              <button
                type="button"
                onClick={onCancelRun}
                style={{ marginTop: 4, background: "none", border: "none", padding: "6px 0", cursor: "pointer", color: "var(--m-muted)", fontSize: 12, fontWeight: 700 }}
              >
                Cancel
              </button>
            </div>
          )}
          <div className="cta" style={{ alignItems: "center" }}>
            {!(simple && hasPlan) && (
              <button
                type="button"
                ref={planCtaRef}
                className={hasPlan ? "p2" : "p1"}
                onClick={onStartCrewSync}
                disabled={phase === "running"}
              >
                {phase === "running"
                  ? "Building…"
                  : phase === "done"
                    ? "Update my plan"
                    : "Make my plan"}
              </button>
            )}

          </div>
          {phase === "idle" && totalSteps > 0 && (
            <p style={{ marginTop: "8px", fontSize: "11px", color: "var(--m-muted)" }}>
              {simple
                ? "Takes about a minute."
                : "Takes about a minute. You'll get a file to add the steps to your calendar — no notifications."}
            </p>
          )}
          </div>
        </div>
      </div>

      {/* Step 6 — the crew's findings ride the slab under the next nudge:
          one prose line, one mini visual, one action pill per card. Every
          number is already on this page elsewhere (the residual, the
          preview's coverage, the gate's scan, the resolved pin); a card
          exists only where its fact does. */}
      {/* §4a — the crew's names on the cards are askable: "Iris flagged…"
          makes Iris a button that opens her field under the card, the
          card's own prose bound as the bare-"why" context. */}
      <InsightCards
        cards={insights}
        onSelectDay={onSelectDay}
        live
        askFor={(card) => {
          if (!card.agent) return null;
          const context: CrewAnswerContext = {
            about: INSIGHT_ASK_ABOUT[card.id],
            detail: card.prose,
            owner: card.agent.owner,
            agent: card.agent.agent,
            provenance: "the insight card",
          };
          const facts: CrewFacts = { ...askFacts, context };
          return {
            label: `Ask ${card.agent.owner}`,
            owner: card.agent.owner,
            agent: card.agent.agent,
            facts,
            onAsk: (q: string) => crewAnswer(q, facts),
          };
        }}
      />

      {/* Bet 2 — "spend your daylight here". Arrival day only, taste-ranked
          venues inside the destination. Null (no key, no places, wrong day)
          renders nothing — never filler. Notes only, never scorer/timing. */}
      {expandAllWhy && activeDaySpec && (
        <LightWindowPanel
          plan={locked.get(currentLabel) ?? preview?.get(currentLabel)?.plan ?? null}
          date={activeDaySpec.date}
          city={cityFor(activeDaySpec.dayIndex)}
          preview={!locked.has(currentLabel)}
          example={baselineKind === "demo-default" && !wakeBand}
        />
      )}
      {tastePanels.itinerary}

      {simple && trip && (
        <div className="rise" style={{ animationDelay: ".25s", margin: "8px 4px 0", fontSize: "12px", color: "var(--m-muted)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>
            {dawnOwedMin > 0
              ? <>Your body clock is {Math.round(dawnOwedMin / 6) / 10}h {trip.direction === "east" ? "behind" : "ahead"} {trip.destination.name} time · {readinessPct}% {readiness.source === "preview" ? "banked on preview" : "of shift locked"}</>
              : <>Your body clock is on {trip.destination.name} time</>}
          </span>
          <button
            type="button"
            onClick={() => setGlobeOpen((v) => !v)}
            aria-expanded={globeOpen}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--m-muted)", fontSize: "12px", fontWeight: 700 }}
          >
            {globeOpen ? "Hide globe ▴" : "Show globe ▾"}
          </button>
        </div>
      )}

      {/* Item 15 — the meeting is the product. The subhead sits under the
          dawn card so the body-time gap is read against the event it will
          decide. `null` from the contract renders nothing — a fixture
          meeting with no real attendees would be the worst possible fake. */}
      {expandAllWhy && heroMtg &&
        (!simple ||
          (() => {
            const mtgIdx = trip?.days.find((d) => d.label === heroMtg.dayLabel)?.dayIndex;
            return (
              mtgIdx !== undefined &&
              activeDaySpec !== null &&
              (activeDaySpec.dayIndex === mtgIdx || activeDaySpec.dayIndex === mtgIdx - 1)
            );
          })()) && (
        <div
          className="rise hero-meeting"
          style={{
            animationDelay: ".25s",
            margin: "8px 4px 0",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid var(--m-border)",
            background: "var(--m-card)",
            fontSize: "13px",
            color: "var(--m-text)",
            lineHeight: 1.45,
          }}
        >
          {/* Item 15 — the meeting is the product. The block splits into the
              event line on top and the body-time delta underneath. The delta
              is the sales pitch — two scannable columns the user can read at
              a glance, not a sentence that buries the gap inside clauses. */}
          <b style={{ color: "var(--m-text)" }}>
            {(() => {
              const spec = trip?.days.find((d) => d.label === heroMtg.dayLabel);
              const day = spec
                ? friendlyDayLabel(spec, trip?.departureDayIndex)
                : heroMtg.dayLabel;
              if (simple) {
                return `${heroMtg.title}, ${day} ${fmtMin(heroMtg.localMin)} — feels like ${fmtMin(heroMtg.bodyMin)} to your body${heroMtg.bodyWithoutPlanMin !== heroMtg.bodyMin ? ` (${fmtMin(heroMtg.bodyWithoutPlanMin)} without a plan)` : ""}`;
              }
              return `${day}, ${fmtMin(heroMtg.localMin)} · ${heroMtg.title}`;
            })()}
          </b>
          {!simple && (
          <div style={{ marginTop: "6px", fontSize: "10px", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--m-muted)" }}>
            How this meeting will feel to your body
          </div>
          )}
          <div
            style={{
              display: simple ? "none" : "grid",
              marginTop: "4px",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              fontSize: "12px",
              color: "var(--m-muted)",
            }}
          >
            <div>
              <span style={{ display: "block", fontWeight: 700, color: "var(--m-text)", fontSize: "13px" }}>
                {fmtMin(heroMtg.bodyMin)}
              </span>
              <span>with this plan</span>
            </div>
            {heroMtg.bodyWithoutPlanMin !== heroMtg.bodyMin ? (
              <div>
                <span style={{ display: "block", fontWeight: 700, color: "#b04523", fontSize: "13px" }}>
                  {fmtMin(heroMtg.bodyWithoutPlanMin)}
                </span>
                <span>without a plan</span>
              </div>
            ) : (
              <div>
                <span style={{ display: "block", fontWeight: 700, color: "var(--m-text)", fontSize: "13px" }}>
                  {fmtMin(heroMtg.bodyWithoutPlanMin)}
                </span>
                <span>your body time</span>
              </div>
            )}
          </div>
          {heroMtg.status === "risk" && (
            <p
              style={{
                margin: "8px 0 0",
                fontSize: "11px",
                color: "#b04523",
                fontWeight: 700,
              }}
            >
              {locked.size === 0
                ? "This falls in your body's night. Make your plan to fix it."
                : "Still early for your body — expect to feel tired."}
            </p>
          )}
        </div>
      )}

      {/* Marks waiting — surfaced at the top of the page so a traveller
          who marked steps and scrolled away sees the queue the next visit.
          The same "send to crew" affordance lives at the bottom of the
          page; this copy is the reminder, not a new flow. */}
      {pendingMarks.size > 0 && (
        <div
          className="rise marks-waiting wide"
          style={{
            animationDelay: ".2s",
            marginTop: "12px",
            padding: "10px 14px",
            borderRadius: "12px",
            border: "1px solid var(--m-border)",
            background: "var(--m-card)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--m-text)" }}>
            You&apos;ve marked {pendingMarks.size} {pendingMarks.size === 1 ? "step" : "steps"}.
            <span style={{ color: "var(--m-muted)", fontWeight: 600 }}>
              {" "}Send them so we can adjust the rest of your plan.
            </span>
          </span>
          <button
            type="button"
            onClick={sendPendingMarks}
            style={{
              border: "1px solid #D96B43",
              background: "#D96B43",
              color: "var(--m-card)",
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Update plan
          </button>
        </div>
      )}

      {/* Guided ribbon — the day's crew beats in one line */}
      {dayBeat && (
        <div
          className="rise"
          style={{
            marginTop: "8px",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--m-muted)",
            letterSpacing: "0.02em",
          }}
        >
          {dayBeat}
        </div>
      )}

      {/* Check-in — the thumb-sized touch that keeps the plan honest. With
          per-step marks queued it becomes the send surface; without them the
          day-level verdicts still work in one tap. */}
      {phase === "done" && onCheckIn && (pendingMarks.size > 0 || dayVerdictAllowed) && (
        <div
          className="card rise wide"
          style={{
            marginTop: "12px",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          {pendingMarks.size > 0 ? (
            <>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--m-text)" }}>
                You&apos;ve marked {pendingMarks.size} {pendingMarks.size === 1 ? "step" : "steps"}.
                Send them so we can adjust the rest of your plan.
              </span>
              <button
                type="button"
                onClick={sendPendingMarks}
                style={{
                  border: "1px solid #D96B43",
                  background: "#D96B43",
                  color: "var(--m-card)",
                  borderRadius: 999,
                  padding: "8px 16px",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Update plan
              </button>
            </>
          ) : dayVerdictAllowed ? (
            <>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--m-text)" }}>
                How did {isToday ? "today" : currentDayName} go?
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                {(["done", "partial", "skipped"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendDayVerdict(s)}
                    style={{
                      border: "1px solid var(--m-border)",
                      background: s === "done" ? "#D96B43" : "var(--m-card)",
                      color: s === "done" ? "var(--m-card)" : "var(--m-text)",
                      borderRadius: 999,
                      padding: "8px 14px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {s === "done" ? "Did it all" : s === "partial" ? "Some of it" : "None of it"}
                  </button>
                ))}
              </span>
            </>
          ) : null}
        </div>
      )}

      {/* The rail — one line per step, in the order the day happens */}
      {expandAllWhy && calSummary && (
        <div
          className="cal-summary rise wide"
          style={{ animationDelay: ".35s" }}
          aria-label="Calendar fit"
        >
          {/* The calendar negotiation in one sentence — how many post-flight
              meetings land at a bad body time and what we can do about it.
              Detailed view only. */}
          {(() => {
            const bad = calSummary.total - calSummary.ready;
            const line =
              calSummary.total === 0
                ? "No meetings after you land — nothing clashes with the plan."
                : bad === 0
                  ? `All ${calSummary.total} meeting${calSummary.total === 1 ? "" : "s"} after you land already sit${calSummary.total === 1 ? "s" : ""} at a good body time.`
                  : `${bad} of ${calSummary.total} meeting${calSummary.total === 1 ? "" : "s"} after you land hit${bad === 1 ? "s" : ""} a bad body time` +
                    (calSummary.movable > 0
                      ? ` — we can move ${calSummary.movable} event${calSummary.movable === 1 ? "" : "s"}.`
                      : " — the plan works around it.");
            return <p className="cal-summary-line">{line}</p>;
          })()}
        </div>
      )}

      {steps.some((n) => skippedIds.has(n.id)) && (
        <div className="constraint-chips" role="group" aria-label="Active constraints">
          {steps
            .filter((n) => skippedIds.has(n.id))
            .map((n) => (
              <span key={n.id} className="constraint-chip">Can&apos;t: {n.title}</span>
            ))}
          {onReplanConstraints && (
            <button
              type="button"
              className="constraint-replan"
              onClick={() => {
                const skipped = steps.filter((n) => skippedIds.has(n.id));
                const constraints = constraintsFromSkips(skipped);
                const checkIns = checkInsFromConstraints(constraints);
                onReplanConstraints(checkIns, activeDaySpec?.dayIndex ?? 0);
              }}
            >
              Replan
            </button>
          )}
        </div>
      )}
      {steps.some((n) => skippedIds.has(n.id)) && (
        <div className="recovery-card" role="status">
          <strong>Missed a step?</strong>
          <ul className="recovery-list">
            {steps
              .filter((n) => skippedIds.has(n.id))
              .map((n) => {
                const next = steps.find((s) => s.startMin > n.startMin && !skippedIds.has(s.id));
                const recovery =
                  n.category === "sunlight"
                    ? `Get 20 min of outdoor light at ${next ? fmtMin(next.startMin) : "lunch"} to re-anchor your phase.`
                    : n.category === "nutrition"
                      ? "Shift your caffeine curfew back 30 min and protect adenosine receptors tonight."
                      : n.category === "sleep"
                        ? "Dim overheads 90 min before bed and keep the room cool to protect deep sleep."
                        : "No stress — your plan adapts from here; mark the next step done when you can.";
                return <li key={n.id}>{n.title}: {recovery}</li>;
              })}
          </ul>
        </div>
      )}
      </Room>

      {/* Room: plan — descent to ground level; the rail reads full width.
          On the arrival day its instruments ride this room instead of the
          hidden rail. */}
      {(!arrivalView || tastePanels.arrival) && (
      <Room id="plan">
      {arrivalView && <DayStepper {...stepperProps} />}
      {arrivalView && sunRead && (
        <div className="mb-1 flex items-center justify-end gap-2 px-2">
          <SunSelf read={sunRead} size={34} vt follow speak wake />
        </div>
      )}
      {tastePanels.arrival}
      {!arrivalView && (
      <section
        id="journey-days"
        className={`tl rise wide${previewMode ? " preview" : ""}${resolving ? " resolving" : ""}`}
        style={{ animationDelay: ".4s" }}
        aria-label={`${currentDayName} — steps`}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
          touchStartY.current = e.touches[0].clientY;
        }}
        onTouchEnd={(e) => {
          const startX = touchStartX.current;
          const startY = touchStartY.current;
          touchStartX.current = null;
          touchStartY.current = null;
          if (typeof startX !== "number" || typeof startY !== "number") return;
          const dx = e.changedTouches[0].clientX - startX;
          const dy = e.changedTouches[0].clientY - startY;
          // Axis lock: only a clearly horizontal swipe changes days — a
          // diagonal scroll that drifts sideways must not flip the day.
          if (Math.abs(dx) < 50 || Math.abs(dx) < 2 * Math.abs(dy)) return;
          if (dx < 0 && activeDayIndex < days.length - 1) onSelectDay(days[activeDayIndex + 1].label);
          if (dx > 0 && activeDayIndex > 0) onSelectDay(days[activeDayIndex - 1].label);
        }}
      >
        {/* Day stepper — ‹ › through the days; the centre label opens the
            full list for a direct jump. Present on every day: it heads the
            rail inside the rail, and rides above the arrival view when the
            rail is hidden. */}
        <DayStepper {...stepperProps} />
        <DaySkyStrip steps={steps} resolvedIds={resolvedIds} nowMin={nowMin} label={currentDayName} />
        <div className="tl-rows">
        {steps.map((step, stepIdx) => {
          const isDone = completedIds.has(step.id);
          const isSkip = isSkipped(step.id);
          const receipt = isDone && !previewMode ? receiptFor(step) : null;
          const isOpen = !!expandAllWhy || expandedWhyId === step.id;
          const city = cityFor(step.dayIndex);
          const StepIcon = CAT_ICON[step.category];
          // The city is worth a line only where it changes — which is exactly
          // when it matters, because that is the moment the trip crosses into
          // a new clock.
          const prevCity = stepIdx > 0 ? cityFor(steps[stepIdx - 1].dayIndex) : null;
          const cityChanged = city !== prevCity;
          /* Step 7 — while `resolving` runs, row `stepIdx`'s computed cells
             land when the tick passes it; the one at the tick carries the
             lone "Calculating…" shimmer for its beat. */
          const rowPending = resolving && stepIdx === resolveTick;
          return (
            <div
              key={step.id}
              className={`tl-row${isDone ? " done" : ""}${isSkip ? " skipped" : ""}`}
              data-cat={step.category}
              data-resolved={resolving && stepIdx < resolveTick ? "" : undefined}
              data-pending={rowPending ? "" : undefined}
              /* An invisible row is a row that can't be tapped, tabbed or
                 swiped — inert until its cells land. */
              inert={resolving && stepIdx >= resolveTick ? true : undefined}
              style={
                swipe?.id === step.id
                  ? {
                      transform: `translateX(${swipe.dx}px)`,
                      background:
                        swipe.dx > 20
                          ? "rgba(217,107,67,0.14)"
                          : swipe.dx < -20
                            ? "rgba(120,120,120,0.14)"
                            : undefined,
                    }
                  : undefined
              }
              onPointerDown={(e) => {
                if (e.pointerType !== "touch") return;
                swipeRef.current = { id: step.id, x0: e.clientX, y0: e.clientY, vert: false };
              }}
              onPointerMove={(e) => {
                const st = swipeRef.current;
                if (!st || st.id !== step.id || st.vert) return;
                const dx = e.clientX - st.x0;
                const dy = e.clientY - st.y0;
                if (Math.abs(dy) > Math.abs(dx)) {
                  st.vert = true;
                  setSwipe(null);
                  return;
                }
                setSwipe({ id: step.id, dx });
              }}
              onPointerUp={(e) => {
                const st = swipeRef.current;
                swipeRef.current = null;
                const dx = e.clientX - (st?.x0 ?? e.clientX);
                setSwipe(null);
                if (!st || st.vert) return;
                if (dx > 72) doneTap(step);
                else if (dx < -72) skipTap(step);
              }}
              onPointerCancel={() => {
                swipeRef.current = null;
                setSwipe(null);
              }}
            >
              <button
                type="button"
                className={`tl-check${isDone ? " on" : ""}`}
                onClick={(e) => { e.stopPropagation(); doneTap(step); }}
                aria-pressed={isDone}
                aria-label={`Mark "${step.title}" done`}
              >
                {isDone ? "✓" : ""}
              </button>
              {rowPending && (
                <span className="resolve-calc" aria-hidden="true">
                  Calculating…
                </span>
              )}
              <div className="tl-time">
                <b>
                  {fmtMin(step.startMin)}–{fmtMin(step.endMin)}
                </b>
                {cityChanged && <span>{city}</span>}
              </div>
              <div
                className="tl-body"
                role="button"
                tabIndex={0}
                onClick={() => !expandAllWhy && setExpandedWhyId(isOpen ? null : step.id)}
                onKeyDown={(e) => {
                  if (!expandAllWhy && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    e.stopPropagation();
                    setExpandedWhyId(isOpen ? null : step.id);
                  }
                }}
                style={{ cursor: expandAllWhy ? "default" : "pointer" }}
              >
                <h3 className="tl-title">
                  <span className="tl-glyph" aria-hidden="true">
                    <StepIcon size={13} strokeWidth={2.4} />
                  </span>
                  <span className="tl-title-text">{step.title}</span>
                  {isSkip && !isOpen && (
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--m-faint)" }}>Skipped</span>
                  )}
                  {step.id === heroNudge?.id ? (
                    <span className="tl-tag placed">Next up</span>
                  ) : step.calendarMove ? (
                    <span className="tl-tag movable">Moves a calendar event</span>
                  ) : null}
                  <span aria-hidden="true" style={{ marginLeft: "auto", color: "var(--m-faint)" }}>
                    {isOpen ? "▴" : "▾"}
                  </span>
                </h3>
                {isDone && !isOpen && (
                  /* The receipt on the closed row (round 26): immediate
                     visible response — doing the step answers the step. */
                  <p className="tl-receipt">
                    Done — {receipt ?? impactCopy(step.category, "done")}.
                  </p>
                )}
                {isOpen && (
                  <div className="drawer tl-drawer rise">
                    <p>{step.actionSummary}</p>
                    <p>{step.whyItHelps}</p>
                    <button
                      type="button"
                      className="tl-skip"
                      onClick={(e) => { e.stopPropagation(); skipTap(step); }}
                      aria-pressed={isSkip}
                    >
                      {isSkip ? "Skipped ✓" : "Skip"}
                    </button>
                    {isDone && (
                      <p className="tl-receipt">
                        {previewMode ? (
                          <>Done — {impactCopy(step.category, "done")}.</>
                        ) : receipt ? (
                          <>
                            Done — {receipt}
                            {pendingMarks.has(step.id) ? " · saved for your next check-in" : ""}.
                          </>
                        ) : (
                          <>
                            Done — {impactCopy(step.category, "done")}
                            {pendingMarks.has(step.id) ? " · saved for your next check-in" : ""}.
                          </>
                        )}
                      </p>
                    )}
                    {isSkip && (
                      <div className="tl-recovery-tip">
                        <p className="tl-recovery-header">Skipped · Recovery suggestion</p>
                        <p className="tl-recovery-body">
                          {recoveryTip(step.category, step.title)}
                        </p>
                        {!previewMode && (
                          <span className="tl-recovery-note">
                            Impact: {impactCopy(step.category, "missed")} · Saved for check-in.
                          </span>
                        )}
                      </div>
                    )}
                    {step.evidence ? (
                      <p
                        className="evline"
                        title={
                          step.evidence.evalVerdict
                            ? evalChipTitle(step.evidence.evalVerdict.violations)
                            : step.evidence.memoryPath
                        }
                      >
                        {(() => {
                          const v = step.evidence!.evalVerdict;
                          return [
                            v
                              ? evalChipLabel(v.score, v.violations)
                              : "checked against sleep research",
                            ...(step.evidence!.draftRejected ? ["revised once"] : []),
                            ...(step.evidence!.placedBy === "planner" && step.evidence!.movedMin != null
                              ? [`planner moved ${step.evidence.movedMin > 0 ? "+" : ""}${step.evidence.movedMin}m`]
                              : step.evidence!.placedBy === "solver"
                                ? ["solver's slot"]
                                : []),
                            ...(step.evidence!.memoryPath ? ["learned from your past trips"] : []),
                          ].join(" · ");
                        })()}
                        {step.citation ? (
                          <span className="evline-cite" title={step.citation.title}>
                            {" "}· ◈ {step.citation.title.length > 56
                              ? `${step.citation.title.slice(0, 54)}…`
                              : step.citation.title}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {step.evidence?.evalVerdict?.violations.length ? (
                      <p style={{ margin: "4px 0 0", fontSize: "10px", color: "#b04523" }}>
                        {step.evidence.evalVerdict.violations.join("; ")}
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
        {steps.length > 0 && (
          <p className="tl-hint">Swipe right to mark done, left to skip · tap a step for why</p>
        )}
        {steps.length === 0 && (
          <p className="tl-empty">
            {isPostFlightDay
              ? "We'll plan this day after you land."
              : "No steps for this day yet."}
          </p>
        )}
      </section>
      )}
      </Room>
      )}

      {/* Room: discover — landed at the destination. Taste discovery is
          enrichment, not instrument — it trails the day's rail rather than
          splitting the action blocks from the list they control. */}
      {((trip && destKey) || (simple && hasPlan && !tripFinished)) && (
      <Room
        id="discover"
        /* The bounded mascot beat: the sun gains its face over the painted
           disc — the same read the arrival view carries, DOM so the face
           stays honest under every backend. */
        mascot={sunRead ? <SunSelf read={sunRead} size={90} tone="ink" /> : undefined}
      >
      {trip && destKey && (
        <TasteDiscovery
          key={`${trip.origin.code}-${trip.destination.code}-${trip.days.find((d) => d.dayIndex === trip.departureDayIndex)?.date ?? ""}`}
          destination={{ name: trip.destination.name, lon: trip.destination.lon, lat: trip.destination.lat }}
          initialTaste={tasteData}
          favorites={tasteProfile?.favorites}
          onFavoritesChange={tasteProfile?.setFavorites}
          favoritesReady={tasteProfile?.ready ?? true}
          storageAvailable={tasteProfile?.storageAvailable}
          onFitPlan={canFitTaste ? onStartCrewSync : undefined}
          planning={phase === "running"}
        />
      )}

      {/* Simple + a saved plan: the day's steps are the thing; re-running is
          the quiet second action at the bottom of the list. */}
      {simple && hasPlan && !tripFinished && (
        <button
          type="button"
          onClick={onStartCrewSync}
          disabled={phase === "running"}
          style={{ margin: "10px auto 0", display: "block", background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--m-muted)", fontSize: "12px", fontWeight: 700 }}
        >
          {phase === "running" ? `Building your plan… (${locked.size} of ${days.length} days)` : "Update my plan"}
        </button>
      )}
      </Room>
      )}
      </FeedWorld>
      {/* Fixed-position toast — outside the rooms so the stacking context
          never clips it. */}
      {undoToast}
    </>
  );
}
