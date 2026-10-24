"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { coverageOf, fmtMin } from "@/domain/circadian";
import {
  buildDailyNudgesForDay,
  stepImpactMin,
  tasteStrip,
  type NudgeCategory,
  type TasteStrip,
  type TravelerNudge,
} from "@/domain/nudges";
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
import { calendarSummary, heroMeeting } from "@/domain/hero";
import { secondTripCopy, secondTripProof } from "@/domain/second-trip";
import { meetingReadiness } from "@/domain/readiness";
import { friendlyDayLabel } from "@/lib/day-label";
import { isTripFinished } from "@/lib/trip-status";
import { Bell, BellRing } from "lucide-react";
import { VoiceControls } from "@/components/VoiceControls";
import { useUndoToast } from "@/components/UndoToast";
import type {
  AdherenceProfile,
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

export interface NudgeFeedScreenProps {
  trip: Trip | null;
  phase: "idle" | "running" | "done";
  selectedDayLabel: string;
  onSelectDay: (label: string) => void;
  locked: Map<string, DayPlan>;
  drafts: Map<string, { plan: DayPlan; attempt?: number }>;
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
  /** Report what actually happened — per-step did/skip marks or one
   *  day-level verdict. `lastMarkedDayIndex` lets the replan resume the day
   *  after the checked day. */
  onCheckIn?: (checkIns: CheckIn[], lastMarkedDayIndex: number) => void;
}

/** A one-tap mark waiting to be told to the crew — turns timeline taps into
 *  structured check-ins (kind + startMin, so the early-skip floor learns). */
type PendingMark = {
  dayIndex: number;
  kind?: InterventionKind;
  startMin?: number;
  status: "done" | "skipped";
  /** Reads like what the wearer said — feeds the crew feed line and the
   *  graph finding text ("skipped: Get outside light"). */
  text: string;
  at: number;
};

/** Nudge category → the intervention kind a did/skip mark refers to.
 *  Calendar/flight nudges record status + time but carry no kind — moving a
 *  meeting isn't a physiological ask. */
const CATEGORY_KIND: Partial<Record<NudgeCategory, InterventionKind>> = {
  sunlight: "light_exposure",
  run: "exercise",
  nutrition: "caffeine_cutoff",
  sleep: "sleep_window",
};

export function NudgeFeedScreen({
  externalMark,
  trip,
  phase,
  selectedDayLabel,
  onSelectDay,
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
  onCheckIn,
}: NudgeFeedScreenProps) {
  const effectiveAdherence = adherence ?? ADHERENCE_PROFILE;
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [expandedWhyId, setExpandedWhyId] = useState<string | null>(null);
  const [showMissed, setShowMissed] = useState(false);
  const [heroWhyId, setHeroWhyId] = useState<string | null>(null);
  const [globeOpen, setGlobeOpen] = useState(false);
  const [dayListOpen, setDayListOpen] = useState(false);
  const [celebrated, setCelebrated] = useState(false);
  // The wake ack is a this-session thank-you, not a permanent banner.
  const [wakeJustAnswered, setWakeJustAnswered] = useState(false);
  // "Got it" line lingers three seconds where the card was.
  const [wakeCollapsing, setWakeCollapsing] = useState(false);
  const { toast: undoToast, show: showUndo } = useUndoToast();
  const [swipe, setSwipe] = useState<{ id: string; dx: number } | null>(null);
  const swipeRef = useRef<{ id: string; x0: number; y0: number; vert: boolean } | null>(null);

  // Item 11 — while the numbers are the sample persona's, steps are a preview
  // rather than commitments. `isPreview` is B's contract (domain/preview.ts):
  // demo-default with the wake question unanswered, and unknown-kind (nothing
  // fetched yet) counts as preview so fixture numbers are never shown as
  // measured before provenance is known.
  const previewMode = isPreview(baselineKind, wakeBand);
  // Same rule, but stated as the action the renderer is allowed to perform.
  // Kept as a separate symbol so the contract — "no tap becomes a CheckIn
  // on preview" — can be asserted on its own.
  const tapsBecomeCheckIns = tapBecomesCheckIn(baselineKind, wakeBand);

  // Trip-scoped persistence — ids are day-label-keyed, so a different trip
  // must not inherit another trip's "done" state.
  const completedKey = trip
    ? `${trip.origin.code}-${trip.destination.code}-${trip.days[0]?.date ?? ""}`
    : "none";

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem(`meridian:completedNudges:${completedKey}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setCompletedIds(new Set(parsed));
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [completedKey]);

  const toggleComplete = useCallback((id: string) => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(`meridian:completedNudges:${completedKey}`, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [completedKey]);

  // Pending did/skip marks — the check-in ledger, trip-scoped like the done
  // state. Marks queue on tap and flush when the traveller checks in; until
  // then they survive a refresh.
  const [pendingMarks, setPendingMarks] = useState<Map<string, PendingMark>>(new Map());
  // Preview taps (item 11). Held in memory only — never persisted, never
  // flushed to a CheckIn. Separate from `completedIds`/`pendingMarks` precisely
  // so no code path can accidentally treat them as durable.
  const [skippedPreview, setSkippedPreview] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem(`meridian:pendingCheckins:${completedKey}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setPendingMarks(new Map(parsed));
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [completedKey]);

  const savePending = useCallback((next: Map<string, PendingMark>) => {
    try {
      localStorage.setItem(
        `meridian:pendingCheckins:${completedKey}`,
        JSON.stringify([...next]),
      );
    } catch {
      /* ignore */
    }
  }, [completedKey]);

  /** One tap on Done — marks the step and queues a structured check-in.
   *  Tapping again un-does both.
   *
   *  On preview (item 11) this is a dry run: the tap still moves the UI, but
   *  nothing is written to `meridian:completedNudges` or
   *  `meridian:pendingCheckins`, and so nothing becomes a `CheckIn`. A tap on
   *  numbers the app invented must never become training data — the planner
   *  folds these into the compliance floor and graph memory, which is how a
   *  stranger's fabricated night would train the scorer. */
  const markDone = useCallback((s: TravelerNudge) => {
    if (!tapsBecomeCheckIns) {
      setCompletedIds((prev) => {
        const next = new Set(prev);
        if (next.has(s.id)) next.delete(s.id);
        else next.add(s.id);
        return next;
      });
      return;
    }
    const wasDone = completedIds.has(s.id);
    toggleComplete(s.id);
    const next = new Map(pendingMarks);
    if (wasDone) next.delete(s.id);
    else
      next.set(s.id, {
        dayIndex: s.dayIndex,
        kind: CATEGORY_KIND[s.category],
        startMin: s.startMin,
        status: "done",
        text: `did: ${s.title}`,
        at: Date.now(),
      });
    savePending(next);
    setPendingMarks(next);
  }, [pendingMarks, completedIds, toggleComplete, savePending, tapsBecomeCheckIns]);

  /** One tap on Skip — the adherence signal that matters most. Un-dones the
   *  step if it was marked done; tapping again un-skips. */
  const markSkipped = useCallback((s: TravelerNudge) => {
    // Preview is a dry run here too — see markDone.
    if (!tapsBecomeCheckIns) {
      setSkippedPreview((prev) => {
        const next = new Set(prev);
        if (next.has(s.id)) next.delete(s.id);
        else next.add(s.id);
        return next;
      });
      setCompletedIds((prev) => {
        if (!prev.has(s.id)) return prev;
        const next = new Set(prev);
        next.delete(s.id);
        return next;
      });
      return;
    }
    if (completedIds.has(s.id)) toggleComplete(s.id);
    const wasSkipped = pendingMarks.get(s.id)?.status === "skipped";
    const next = new Map(pendingMarks);
    if (wasSkipped) next.delete(s.id);
    else
      next.set(s.id, {
        dayIndex: s.dayIndex,
        kind: CATEGORY_KIND[s.category],
        startMin: s.startMin,
        status: "skipped",
        text: `skipped: ${s.title}`,
        at: Date.now(),
      });
    savePending(next);
    setPendingMarks(next);
  }, [pendingMarks, completedIds, toggleComplete, savePending, tapsBecomeCheckIns]);

  const skippedIds = useMemo(
    () =>
      new Set(
        [...pendingMarks.entries()]
          .filter(([, m]) => m.status === "skipped")
          .map(([id]) => id),
      ),
    [pendingMarks],
  );

  // On preview the "skipped" set is the in-memory one, so the step resolves out
  // of the hero and the miss list without anything durable changing.
  const isSkipped = (id: string) =>
    previewMode ? skippedPreview.has(id) : skippedIds.has(id);

  /** Send every queued mark to the crew — they become the replan's check-in
   *  context. The ledger clears once it's handed over. */
  const sendPendingMarks = () => {
    if (!onCheckIn || pendingMarks.size === 0) return;
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
    const empty = new Map<string, PendingMark>();
    setPendingMarks(empty);
    savePending(empty);
    onCheckIn(checkIns, last);
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
      if (!onCheckIn || !activeDaySpec) return;
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
    [onCheckIn, activeDaySpec],
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
  const dawnOwedMin = useMemo(() => {
    if (!trip) return 0;
    if (lockedDays.length) return coverageOf(trip, lockedDays).residualMin;
    return landedResidualMin ?? Math.abs(trip.requiredShiftMin);
  }, [trip, lockedDays, landedResidualMin]);

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
    () => new Set([...completedIds, ...(previewMode ? skippedPreview : skippedIds)]),
    [completedIds, skippedIds, skippedPreview, previewMode],
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
      const wasSkipped = previewMode ? skippedPreview.has(st.id) : skippedIds.has(st.id);
      markSkipped(st);
      if (!wasSkipped) showUndo("Skipped", () => markSkipped(st));
    },
    [previewMode, skippedPreview, skippedIds, markSkipped, showUndo],
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
  const simple = !expandAllWhy;

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
    return heroMeeting({
      trip,
      calendar: calendarEvents,
      locked: [...locked.values()],
      previewLocked,
      baseline,
    });
  }, [trip, calendarEvents, locked, previewLocked, baseline]);

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
  const [taste, setTaste] = useState<{ destination?: string; places?: { name?: string; categories?: string[] }[] } | null>(null);
  useEffect(() => {
    if (!trip) return;
    let cancelled = false;
    fetch(
      `/api/taste?city=${encodeURIComponent(trip.destination.name)}&lon=${trip.destination.lon}&lat=${trip.destination.lat}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.enabled && Array.isArray(d.places)) setTaste(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trip]);
  const tasteStripData: TasteStrip | null = useMemo(() => {
    if (!trip || !activeDaySpec) return null;
    return tasteStrip(taste, activeDaySpec.dayIndex, trip.departureDayIndex, trip.destination.name);
  }, [taste, trip, activeDaySpec]);

  return (
    <>
      {/* Split-Horizon Hero Card — the left panel is the trip's real dawn line:
          body clock against destination, with the next light window on it. */}
          {(wakeCollapsing ||
            (baselineKind === "demo-default" && !wakeBand && onWakeBand)) && (
          <div className="ask-wrap">
            <div className={`ask${wakeCollapsing ? " collapsing" : ""}`} role="group" aria-label="Your natural wake time">
              <p className="ask-title">Make this plan yours</p>
              <p>
                On a day with nothing early planned, when do you naturally wake?
                <span> Answer once and we&apos;ll fit the plan to you.</span>
              </p>
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
              {!simple && (
                <p className="ask-promise">
                  We won&apos;t schedule anything before you&apos;d normally be up. Most of
                  the work happens in the evening.
                </p>
              )}
              <p className="ask-foot">
                Until then, you&apos;re seeing an example plan.
              </p>
            </div>
            </div>
          )}

      <div
        className={`hero rise${simple && !globeOpen ? " slim" : ""}`}
        style={{ animationDelay: ".2s" }}
      >
        {trip && (!simple || globeOpen) && (
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
          {/* One frame, not six hedges. When the wake question is live
              (demo-default, unanswered), it carries the example-plan framing
              itself — the separate tag is dropped so there is one decision
              point, not two. Other fixture states keep their own tag. Garmin
              never shows one: the numbers were already theirs. */}
          {baselineSource === "fixture" &&
            !(baselineKind === "demo-default" && !wakeBand && onWakeBand) && (
              <p className="demo-tag">
                {baselineKind === "demo-default" && !wakeBand
                  ? "Example traveller — these numbers aren't your measurements."
                  : "Your wake time is yours. Sleep and heart data are examples until you connect a wearable."}
              </p>
            )}

          {/* After an answer: the card collapses and this line shows for 3s
              in its place. wakeAck stays for other surfaces. */}
          {wakeJustAnswered && (
            <p className="demo-tag" style={{ borderColor: "#cfe3d4" }}>
              Got it — the plan now fits your mornings.
            </p>
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
                  <span
                    className="tw"
                    style={{ alignSelf: "flex-start", fontSize: "15px", fontWeight: 800 }}
                  >
                    {countdown ?? ""}
                    {countdown ? " · " : ""}
                    {fmtMin(heroNudge.startMin)} {cityFor(heroNudge.dayIndex)}
                  </span>
                  <div key={heroNudge.id} className="nudge-in">
                  <h2>{heroNudge.title}</h2>
                  <p className="s">{heroNudge.actionSummary}</p>
                </div>
                  {expandAllWhy || heroWhyId === heroNudge.id ? (
                    <div className="drawer">
                      <b>Why this helps</b>
                      <p>{heroNudge.whyItHelps}</p>
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
                    <>
                      Done — {impactCopy(heroNudge.category, "done")}. Example
                      plan only, so nothing is saved.
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
                <p className="warn-ink" style={{ margin: 0, fontSize: "12px" }}>
                  {previewMode ? (
                    <>Skipped — example plan only, nothing saved.</>
                  ) : (
                    <>
                      Skipped — {impactCopy(heroNudge.category, "missed")}.
                      We&apos;ll adjust the rest of your plan when you check in.
                    </>
                  )}
                </p>
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

      {simple && trip && (
        <div className="rise" style={{ animationDelay: ".25s", margin: "8px 4px 0", fontSize: "12px", color: "var(--m-muted)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span>
            {dawnOwedMin > 0
              ? <>Your body clock is {Math.round(dawnOwedMin / 6) / 10}h {trip.direction === "east" ? "behind" : "ahead"} {trip.destination.name} time · {readinessPct}% adjusted before you fly{readiness.source === "preview" ? " (example)" : ""}</>
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
      {heroMtg &&
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
          className="rise marks-waiting"
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

      {/* Day stepper — ‹ › through the days; the centre label opens the
          full list for a direct jump. Real trip days only. */}
      {days.length > 0 && activeDaySpec && (
        <div className="rise" style={{ animationDelay: ".3s", marginTop: "22px", position: "relative" }}>
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
            <div className="card" style={{ position: "absolute", zIndex: 30, top: "calc(100% + 4px)", left: 0, right: 0, padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
              {days.map((d) => (
                <button
                  key={d.dayIndex}
                  type="button"
                  onClick={() => { onSelectDay(d.label); setDayListOpen(false); }}
                  aria-current={todayIdx === d.dayIndex ? "date" : undefined}
                  className={`day ${d.label === currentLabel ? "on" : ""}`}
                  style={{ width: "100%", textAlign: "left" }}
                >
                  {friendlyDayLabel(d, trip?.departureDayIndex)}
                  {todayIdx === d.dayIndex ? " · Today" : ""}
                </button>
              ))}
            </div>
          )}
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

      {/* Bet 2 — "spend your daylight here". Arrival day only, taste-ranked
          venues inside the destination. Null (no key, no places, wrong day)
          renders nothing — never filler. Notes only, never scorer/timing. */}
      {tasteStripData && (
        <div
          className="card rise"
          style={{ animationDelay: ".35s", marginTop: "12px" }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--m-muted)",
            }}
          >
            Things to do outside in {tasteStripData.destination} (daylight helps)
          </div>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none" }}>
            {tasteStripData.places.map((p) => (
              <li
                key={p.name}
                style={{ fontSize: "13px", color: "var(--m-text)", padding: "4px 0" }}
              >
                <b>{p.name}</b>
                {p.categories.length > 0 && (
                  <span style={{ color: "var(--m-muted)" }}> · {p.categories.join(", ")}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Check-in — the thumb-sized touch that keeps the plan honest. With
          per-step marks queued it becomes the send surface; without them the
          day-level verdicts still work in one tap. */}
      {phase === "done" && onCheckIn && (pendingMarks.size > 0 || dayVerdictAllowed) && (
        <div
          className="card rise"
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
          className="cal-summary rise"
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

      <section className={`tl rise${previewMode ? " preview" : ""}`} style={{ animationDelay: ".4s" }} aria-label={`${currentDayName} — steps`}>
        <div className="tl-rows">
        {steps.map((step, stepIdx) => {
          const isDone = completedIds.has(step.id);
          const isSkip = isSkipped(step.id);
          const isOpen = !!expandAllWhy || expandedWhyId === step.id;
          const city = cityFor(step.dayIndex);
          // The city is worth a line only where it changes — which is exactly
          // when it matters, because that is the moment the trip crosses into
          // a new clock.
          const prevCity = stepIdx > 0 ? cityFor(steps[stepIdx - 1].dayIndex) : null;
          const cityChanged = city !== prevCity;
          return (
            <div
              key={step.id}
              className={`tl-row${isDone ? " done" : ""}${isSkip ? " skipped" : ""}`}
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
                {isOpen && (
                  <div className="drawer tl-drawer">
                    <b>
                      {step.timeWindow} · {city}
                    </b>
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
                      <p style={{ margin: "6px 0 0", fontSize: "12px", color: "var(--m-muted)" }}>
                        {previewMode ? (
                          <>
                            Done — {impactCopy(step.category, "done")}. Example plan
                            only, so nothing is saved.
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
                      <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#b04523" }}>
                        {previewMode ? (
                          <>Skipped — example plan only, nothing saved.</>
                        ) : (
                          <>
                            Skipped — {impactCopy(step.category, "missed")}.
                            We&apos;ll adjust the rest of your plan when you check in.
                          </>
                        )}
                      </p>
                    )}
                    {step.evidence ? (
                      <div className="evrow">
                        <span className="evchip" style={{ background: "transparent", border: "none", padding: "3px 0" }}>
                          Checked against sleep research
                        </span>
                        {step.evidence.evalVerdict && (() => {
                          const violations = step.evidence.evalVerdict.violations;
                          return (
                            <span
                              className={`evchip ${violations.length ? "warn" : "pass"}`}
                              title={evalChipTitle(violations)}
                            >
                              {evalChipLabel(step.evidence.evalVerdict.score, violations)}
                            </span>
                          );
                        })()}
                        {step.evidence.draftRejected && (
                          <span className="evchip warn">revised once</span>
                        )}
                        {step.citation && (
                          <span className="evchip cite" title={step.citation.title}>
                            ◈ {step.citation.title.length > 48
                              ? `${step.citation.title.slice(0, 46)}…`
                              : step.citation.title}
                          </span>
                        )}
                        {step.evidence.memoryPath && (
                          <span className="evchip mem" title={step.evidence.memoryPath}>
                            Based on your past trips
                          </span>
                        )}
                        {step.evidence.evalVerdict?.violations.length ? (
                          <span style={{ width: "100%", fontSize: "10px", color: "#b04523" }}>
                            {step.evidence.evalVerdict.violations.join("; ")}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
        {steps.length === 0 && (
          <p className="tl-empty">
            {isPostFlightDay
              ? "We'll plan this day after you land."
              : "No steps for this day yet."}
          </p>
        )}
      </section>

      {/* Simple + a saved plan: the day's steps are the thing; re-running is
          the quiet second action at the bottom of the list. */}
      {undoToast}
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
    </>
  );
}
