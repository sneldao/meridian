"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { coverageOf, fmtMin } from "@/domain/circadian";
import {
  buildDailyNudgesForDay,
  stepImpactMin,
  type NudgeCategory,
  type TravelerNudge,
} from "@/domain/nudges";
import { previewPlan } from "@/domain/solver";
import {
  dayPlace,
  nowMinOnDay,
  pickNextStep,
  shiftLockedPct,
  todayDayIndex,
} from "@/domain/today";
import { ADHERENCE_PROFILE, type WakeBand } from "@/domain/fixtures";
import { HeroDawnPanel } from "@/components/HeroDawnPanel";
import { evalChipLabel, evalChipTitle } from "@/components/ui/eval-chip";
import { isPreview, tapBecomesCheckIn } from "@/domain/preview";
import { calendarSummary, heroMeeting } from "@/domain/hero";
import { meetingReadiness } from "@/domain/readiness";
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
  onStartCrewSync: () => void;
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

/** Consumer-facing day names — domain labels ("D-3", "D+1") stay internal
 *  keys; users see dates when we have them, or plain words otherwise. The
 *  flight day keeps its ✈ but shows its date, so nothing on screen is a
 *  relative offset the traveller has to decode. */
function friendlyDayLabel(
  d: { label: string; dayIndex: number; date: string },
  departureDayIndex?: number,
): string {
  const dep = departureDayIndex ?? 3;
  let dateLabel = "";
  if (d.date) {
    const dt = new Date(`${d.date}T12:00:00`);
    if (!Number.isNaN(dt.getTime()))
      dateLabel = dt.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
  }
  if (d.dayIndex === dep) return dateLabel ? `✈ ${dateLabel}` : "✈ Flight day";
  if (dateLabel) return dateLabel;
  return d.dayIndex < dep ? `Prep day ${d.dayIndex + 1}` : `Recovery day ${d.dayIndex - dep}`;
}

export function NudgeFeedScreen({
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
  onStartCrewSync,
  onCheckIn,
}: NudgeFeedScreenProps) {
  const effectiveAdherence = adherence ?? ADHERENCE_PROFILE;
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [expandedWhyId, setExpandedWhyId] = useState<string | null>(null);
  const [showMissed, setShowMissed] = useState(false);

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

  // Guided ribbon — the day's crew beats, distilled to one line. Only real
  // events, never reconstructed.
  const dayBeat = useMemo(() => {
    if (!activeDaySpec) return null;
    const vs = verdicts.get(activeDaySpec.label) ?? [];
    if (!vs.length && !memoryPath) return null;
    const parts: string[] = [];
    const nAttempts = Math.max(vs.length, drafts.get(activeDaySpec.label)?.attempt ?? 0);
    if (nAttempts) parts.push(`drafted ${nAttempts}×`);
    const fails = vs.filter((v) => !v.feasible).length;
    if (fails) parts.push(`revised ${fails}×`);
    const latest = vs.at(-1);
    if (locked.has(activeDaySpec.label) && latest) parts.push("locked");
    if (memoryPath) parts.push("your trip memory was used");
    return parts.length ? `Crew: ${parts.join(" · ")}` : null;
  }, [activeDaySpec, verdicts, drafts, locked, memoryPath]);

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

  // The trip is over once the last planned day has passed at the destination's
  // clock. Judged there rather than in the viewer's timezone — a traveller whose
  // trip ended at 21:00 Tokyo time shouldn't still be told there are days left
  // because it's lunchtime at home.
  // The trip is over once the last planned day has fully passed at the
  // destination's clock — compared as calendar dates, not by dividing elapsed
  // minutes, which drifts by one whenever the local time isn't midnight.
  const tripFinished = (() => {
    if (!trip) return false;
    const last = trip.days[trip.days.length - 1];
    if (!last?.date) return false;
    // `nowDate` (captured once above) is the clock to judge with — not
    // `nowMin`, which is null whenever the *selected* day isn't today, and
    // that is exactly the state a finished trip is always in. Judging on it
    // made the completion card unreachable.
    const todayAtDest = new Date(
      nowDate.getTime() + trip.destination.utcOffsetMin * 60000,
    )
      .toISOString()
      .slice(0, 10);
    return (
      Date.parse(`${todayAtDest}T00:00:00Z`) >
      Date.parse(`${last.date}T00:00:00Z`)
    );
  })();
  // Skipped counts as resolved: "I'm not doing this" should drop the step out
  // of the hero slot and the missed list, not keep nagging with it.
  const resolvedIds = useMemo(
    () => new Set([...completedIds, ...(previewMode ? skippedPreview : skippedIds)]),
    [completedIds, skippedIds, skippedPreview, previewMode],
  );
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
    if (n <= 0) return "keeps the rhythm steady";
    return verb === "done" ? `dawn moved ~${n} min closer` : `skip costs ~${n} min`;
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
  // plan. B added `previewLocked` (9651585) so the first impression is the
  // plan's promise ("38% banked on preview") rather than a flat zero.
  // Once anything is locked the preview is ignored.
  const readinessPct = trip
    ? shiftLockedPct(
        trip,
        [...locked.values()],
        preview
          ? [...preview.values()].flatMap((d) =>
              d ? [{ shiftMin: d.plan.shiftMin }] : [],
            )
          : undefined,
      )
    : 0;

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
    // preview values can be null for solver-infeasible days; drop them so
    // heroMeeting sees only the days that would actually lock.
    const previewLocked = preview
      ? [...preview.values()].flatMap((d) =>
          d ? [{ shiftMin: d.plan.shiftMin }] : [],
        )
      : undefined;
    return heroMeeting({
      trip,
      calendar: calendarEvents,
      locked: [...locked.values()],
      previewLocked,
      baseline,
    });
  }, [trip, calendarEvents, locked, preview, baseline]);

  return (
    <>
      {/* Split-Horizon Hero Card — the left panel is the trip's real dawn line:
          body clock against destination, with the next light window on it. */}
      <div className="hero rise" style={{ animationDelay: ".2s" }}>
        {trip && (
          <HeroDawnPanel
            trip={trip}
            owedMin={dawnOwedMin}
            beam={heroBeam}
            readinessPct={readinessPct}
          />
        )}

        {/* The card's right half. These two were siblings of HeroDawnPanel, so
            in a two-column grid the demo tag took cell (1,2) — an empty cream
            box — and "your next step" wrapped to (2,1), orphaned below the fold
            at half width. One wrapper, two grid children. */}
        <div className="hr-col">
          {baselineSource === "fixture" && (
            <p className="demo-tag">
              {baselineKind === "demo-default" && !wakeBand
                ? "Sample traveller — these numbers are not your measurements."
                : "Sample traveller — the wearable figures are sample data; your wake time is yours."}
            </p>
          )}

          {/* Vision Rule 1: one question, at the moment it first matters. The
              demo trip still renders immediately — but the tag above admits the
              numbers are invented, so this is where the one real answer belongs.
              `/api/trip` can't report a `wake-band` kind because it never sees
              `wake`; the band is applied client-side via resolveBaseline, which
              means answering re-plans the preview instantly with no refetch. */}
          {baselineKind === "demo-default" && !wakeBand && onWakeBand && (
            <div className="ask" role="group" aria-label="Your natural wake time">
              <p>
                On a day with nothing early planned, when do you naturally wake?
                <span> One answer and the plan is fitted to you, not to the sample.</span>
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
                    onClick={() => onWakeBand(band)}
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
              <p className="ask-promise">
                Nothing before your floor unless you say so. Evenings do the heavy
                lifting.
              </p>
            </div>
          )}

          <div className="hr">
          <div className="row">
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
              <div className="mini">Your next step · {currentDayName}</div>
            </div>
          </div>

          {totalSteps === 0 ? (
            isPostFlightDay ? (
              <>
                <h2>Planned with you after you land</h2>
                <p className="s">
                  The days before your flight bank what they can
                  {landedResidualHours !== null &&
                    ` — you land about ${landedResidualHours}h short of ${trip?.destination.name ?? "your destination"} time`}{" "}
                  and the crew finishes the plan once you&apos;re down.
                </p>
              </>
            ) : (
              <>
                <h2>Not placed yet — personalise</h2>
                <p className="s">
                  We couldn&apos;t honestly place this day against your calendar
                  and baseline, so there are no invented times here — run the
                  crew and it will draft this day with you.
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
                  <h2>See how the shift landed</h2>
                  <p className="s">
                    The plan ran out. Score the trip against what the crew
                    promised at the gate, then tell it how it actually went — that
                    is what the next trip plans from.
                  </p>
                  <div className="arrival-nudge-btns">
                    <a className="p1" href={`/arrival?date=${trip?.days[0]?.date ?? ""}`}>
                      Score the trip
                    </a>
                    <a className="p2" href="/outcome">
                      How it went
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
                  <h2>{heroNudge.title}</h2>
                  <p className="s">{heroNudge.actionSummary}</p>
                  <div className="drawer">
                    <b>Why this helps</b>
                    <p>{heroNudge.whyItHelps}</p>
                  </div>
                </>
              )}
              <div style={{ display: tripFinished ? "none" : "flex", gap: 10, alignItems: "center", marginTop: "2px" }}>
                <button
                  type="button"
                  onClick={() => markDone(heroNudge)}
                  aria-pressed={completedIds.has(heroNudge.id)}
                  style={{
                    alignSelf: "flex-start",
                    background: previewMode
                      ? "linear-gradient(90deg, #cfc4b4, #ddd3c5)"
                      : "linear-gradient(90deg, #D96B43, #e99a6f)",
                    color: previewMode ? "#5b4d41" : "#fff8ef",
                    border: "none",
                    borderRadius: "999px",
                    padding: "10px 22px",
                    fontSize: "13px",
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                    cursor: "pointer",
                  }}
                >
                  {/* Item 11 — on preview the tap is a try-it, not a record.
                      "Done" next to a fabricated 07:00 read as a commitment,
                      which is what made these taps training data. */}
                  {previewMode
                    ? completedIds.has(heroNudge.id)
                      ? "Tried ✓"
                      : "Try this"
                    : completedIds.has(heroNudge.id)
                      ? "Done ✓"
                      : "Done"}
                </button>
                <button
                  type="button"
                  onClick={() => markSkipped(heroNudge)}
                  aria-pressed={isSkipped(heroNudge.id)}
                  style={{
                    background: "transparent",
                    border: "1px solid #e3d5c3",
                    color: "#7a6a5c",
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
                <p style={{ margin: 0, fontSize: "12px", color: "#7a6a5c" }}>
                  {previewMode ? (
                    <>
                      Tried — {impactCopy(heroNudge.category, "done")} Nothing
                      saved; this is the sample profile, not your week.
                    </>
                  ) : (
                    <>
                      Done — {impactCopy(heroNudge.category, "done")}
                      {pendingMarks.has(heroNudge.id) ? " · feeds your next check-in" : ""}.
                    </>
                  )}
                </p>
              )}
              {isSkipped(heroNudge.id) && (
                <p style={{ margin: 0, fontSize: "12px", color: "#b04523" }}>
                  {previewMode ? (
                    <>Skipped in the preview — nothing saved.</>
                  ) : (
                    <>
                      Skipped — {impactCopy(heroNudge.category, "missed")} · the crew
                      replans around it at check-in.
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
                      color: "#7a6a5c",
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
                            borderTop: "1px solid #eee3d6",
                            fontSize: "12px",
                            color: "#7a6a5c",
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
                                border: "1px solid #e3d5c3",
                                borderRadius: 999,
                                padding: "3px 10px",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#5b4d41",
                                cursor: "pointer",
                              }}
                            >
                              {previewMode ? "Tried" : "Done"}
                            </button>
                            <button
                              type="button"
                              onClick={() => markSkipped(m)}
                              style={{
                                background: "transparent",
                                border: "1px solid #e3d5c3",
                                borderRadius: 999,
                                padding: "3px 10px",
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#7a6a5c",
                                cursor: "pointer",
                              }}
                            >
                              {previewMode ? "Skip" : "Skip"}
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
                Every step is marked done — the rest of the shift happens
                tonight, on the plan you kept.
              </p>
            </>
          )}

          {totalSteps > 0 && (
            <div className={`meter${previewMode ? " preview" : ""}`}>
              <div className="t">
                {previewMode ? (
                  // Item 11 — "0 of 4 done" is a promise about a real day. On
                  // preview it is a demo of the mechanic, so it says so rather
                  // than reporting a streak nobody is actually keeping.
                  <>Preview from the sample · {completedCount} of {totalSteps} tried</>
                ) : (
                  <>{completedCount} of {totalSteps} done{doneWhere}</>
                )}
              </div>
              <div className="bar">
                <i style={{ width: `${previewMode ? 0 : progressPct}%` }} />
              </div>
            </div>
          )}

          <div className="cta">
            <button
              type="button"
              className="p2"
              onClick={onStartCrewSync}
              disabled={phase === "running"}
            >
              {/* Item 13 — the calendar is the compliance surface, not the run
                  button. "Fit to me → to calendar" names the path: every step
                  the crew locks lands as a calendar event the traveller can
                  accept, so adherence is one surface, not two. */}
              {phase === "running"
                ? `Checking your plan (${locked.size}/${days.length})…`
                : "Fit to me → to calendar"}
            </button>
          </div>
          {phase === "idle" && totalSteps > 0 && (
            <p style={{ marginTop: "8px", fontSize: "11px", color: "#7a6a5c" }}>
              The crew locks your plan as a calendar you can accept — the same
              list you already live by. No notifications, just the asks where
              your day already has room.
            </p>
          )}
          </div>
        </div>
      </div>

      {/* Item 15 — the meeting is the product. The subhead sits under the
          dawn card so the body-time gap is read against the event it will
          decide. `null` from the contract renders nothing — a fixture
          meeting with no real attendees would be the worst possible fake. */}
      {heroMtg && (
        <div
          className="rise hero-meeting"
          style={{
            animationDelay: ".25s",
            margin: "8px 4px 0",
            padding: "10px 12px",
            borderRadius: "10px",
            border: "1px solid #e3d5c3",
            background: "#fff8ef",
            fontSize: "13px",
            color: "#5b4d41",
            lineHeight: 1.45,
          }}
        >
          {/* Item 15 — the meeting is the product. The block splits into the
              event line on top and the body-time delta underneath. The delta
              is the sales pitch — two scannable columns the user can read at
              a glance, not a sentence that buries the gap inside clauses. */}
          <b style={{ color: "#3a2e23" }}>
            {heroMtg.dayLabel} {fmtMin(heroMtg.localMin)} {heroMtg.title}
          </b>
          <div
            style={{
              marginTop: "6px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              fontSize: "12px",
              color: "#7a6a5c",
            }}
          >
            <div>
              <span style={{ display: "block", fontWeight: 700, color: "#3a2e23", fontSize: "13px" }}>
                {fmtMin(heroMtg.bodyMin)}
              </span>
              <span>with Meridian</span>
            </div>
            {heroMtg.bodyWithoutPlanMin !== heroMtg.bodyMin ? (
              <div>
                <span style={{ display: "block", fontWeight: 700, color: "#b04523", fontSize: "13px" }}>
                  {fmtMin(heroMtg.bodyWithoutPlanMin)}
                </span>
                <span>without the plan</span>
              </div>
            ) : (
              <div>
                <span style={{ display: "block", fontWeight: 700, color: "#3a2e23", fontSize: "13px" }}>
                  {fmtMin(heroMtg.bodyWithoutPlanMin)}
                </span>
                <span>body time</span>
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
              at risk — lock the plan to clear it
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
            border: "1px solid #e3d5c3",
            background: "#fff8ef",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#3a2e23" }}>
            {pendingMarks.size} {pendingMarks.size === 1 ? "step" : "steps"} marked —
            <span style={{ color: "#7a6a5c", fontWeight: 600 }}>
              {" "}the crew replans the rest around what happened.
            </span>
          </span>
          <button
            type="button"
            onClick={sendPendingMarks}
            style={{
              border: "1px solid #D96B43",
              background: "#D96B43",
              color: "#fff8ef",
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Check in →
          </button>
        </div>
      )}

      {/* Day Selector Pills — real trip days only, never invented fixture dates */}
      {days.length > 0 && (
        <div
          className="row days rise"
          style={{ animationDelay: ".3s" }}
          role="group"
          aria-label="Select trip day"
        >
          {days.map((d) => {
            const isSelected = d.label === currentLabel;
            return (
              <button
                key={d.dayIndex}
                type="button"
                onClick={() => onSelectDay(d.label)}
                aria-pressed={isSelected}
                className={`day ${isSelected ? "on" : ""}`}
              >
                {friendlyDayLabel(d, trip?.departureDayIndex)}
              </button>
            );
          })}
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
            color: "#7a6a5c",
            letterSpacing: "0.02em",
          }}
        >
          {dayBeat}
        </div>
      )}

      {/* Check-in — the thumb-sized touch that keeps the plan honest. With
          per-step marks queued it becomes the send surface; without them the
          day-level verdicts still work in one tap. */}
      {phase === "done" && onCheckIn && (
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
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#5b4d41" }}>
                {pendingMarks.size} {pendingMarks.size === 1 ? "step" : "steps"} marked —
                the crew replans the rest around what happened.
              </span>
              <button
                type="button"
                onClick={sendPendingMarks}
                style={{
                  border: "1px solid #D96B43",
                  background: "#D96B43",
                  color: "#fff8ef",
                  borderRadius: 999,
                  padding: "8px 16px",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Check in →
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#5b4d41" }}>
                How did {currentDayName} go?
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                {(["done", "partial", "skipped"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendDayVerdict(s)}
                    style={{
                      border: "1px solid #e3d5c3",
                      background: s === "done" ? "#D96B43" : "#fff8ef",
                      color: s === "done" ? "#fff8ef" : "#5b4d41",
                      borderRadius: 999,
                      padding: "8px 14px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {s === "done" ? "Did it ✓" : s === "partial" ? "Partly" : "Skipped"}
                  </button>
                ))}
              </span>
            </>
          )}
        </div>
      )}

      {/* The rail — one line per step, in the order the day happens */}
      {calSummary && (
        <div
          className="cal-summary rise"
          style={{ animationDelay: ".35s" }}
          aria-label="Calendar fit"
        >
          {/* Item 13 — surface the numbers the run produces *before* the
              timeline. Movable/fixed give the traveller the shape of the
              negotiation; readinessLabel says how many post-flight meetings
              already clear the sleep window. Nothing is invented — if there
              are no events on the day the block disappears. */}
          <div className="cal-summary-num">
            <b>{calSummary.movable}</b>
            <span>movable</span>
          </div>
          <div className="cal-summary-num">
            <b>{calSummary.fixed}</b>
            <span>fixed</span>
          </div>
          <div className="cal-summary-num">
            <b>{calSummary.readinessLabel}</b>
            <span>post-flight meetings ready</span>
          </div>
        </div>
      )}

      <section className="tl rise" style={{ animationDelay: ".4s" }} aria-label={`${currentDayName} — steps`}>
        {steps.map((step) => {
          const isDone = completedIds.has(step.id);
          const isSkip = isSkipped(step.id);
          const isOpen = !!expandAllWhy || expandedWhyId === step.id;
          const city = cityFor(step.dayIndex);
          return (
            <div key={step.id} className={`tl-row${isDone ? " done" : ""}${isSkip ? " skipped" : ""}`}>
              <div className="tl-time">
                {/* Item 14 — the rail renders the ask as a window, not an
                    instant. The instant reads as a deadline; the window reads
                    as "this is where on the day it fits". The solver already
                    holds floor − 105min and tries at/after-floor light first
                    — the surface now says so. */}
                <b>
                  {fmtMin(step.startMin)}–{fmtMin(step.endMin)}
                </b>
                <span>{city}</span>
              </div>
              <div className="tl-body">
                <h3 className="tl-title">
                  {step.title}
                  {/* Item 14 — the rail carries the same vocabulary as the
                      calendar. A row about a real event is tagged `movable`
                      when the crew can move it; otherwise `placed`, which is
                      the solver's word for "I have chosen this slot against
                      your floor and existing commitments". The day reads
                      calendar-shaped rather than as a list of intentions. */}
                  <span
                    className={`tl-tag ${step.calendarMove ? "movable" : "placed"}`}
                  >
                    {step.calendarMove ? "movable" : "placed"}
                  </span>
                </h3>
                <div className="tl-acts">
                  <button
                    type="button"
                    className="tl-done"
                    onClick={() => markDone(step)}
                    aria-pressed={isDone}
                  >
                    {previewMode
                      ? isDone
                        ? "Tried ✓"
                        : "Try this"
                      : isDone
                        ? "Done ✓"
                        : "Done"}
                  </button>
                  <button
                    type="button"
                    className="tl-skip"
                    onClick={() => markSkipped(step)}
                    aria-pressed={isSkip}
                  >
                    {isSkip ? "Skipped ✓" : "Skip"}
                  </button>
                  {!expandAllWhy && (
                    <button
                      type="button"
                      className="tl-why"
                      onClick={() =>
                        setExpandedWhyId(isOpen ? null : step.id)
                      }
                      aria-expanded={isOpen}
                    >
                      {isOpen ? "Hide details" : "Why & details"}
                    </button>
                  )}
                </div>
                {isDone && (
                  <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#7a6a5c" }}>
                    Done — {impactCopy(step.category, "done")}
                    {pendingMarks.has(step.id) ? " · feeds your next check-in" : ""}.
                  </p>
                )}
                {isSkip && (
                  <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#b04523" }}>
                    Skipped — {impactCopy(step.category, "missed")} · the crew
                    replans around it at check-in.
                  </p>
                )}
                {isOpen && (
                  <div className="drawer tl-drawer">
                    <b>
                      {step.timeWindow} · {city}
                    </b>
                    <p>{step.actionSummary}</p>
                    <p>{step.whyItHelps}</p>
                    {step.evidence ? (
                      <div className="evrow">
                        <span className="evchip" style={{ background: "transparent", border: "none", padding: "3px 0" }}>
                          checked by the scorer · planned by the crew
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
                            ↝ trip memory
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
        {steps.length === 0 && (
          <p className="tl-empty">
            {isPostFlightDay
              ? "Planned with you after you land."
              : "Not placed yet — personalise."}
          </p>
        )}
      </section>
    </>
  );
}
