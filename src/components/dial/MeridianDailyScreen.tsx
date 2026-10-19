"use client";

// The daily screen — TRIP and SHIFT on one clock.
//
// Two modes, one dial. TRIP is the travel plan the crew produced; SHIFT is
// the rotating night-shift week. They share the dial, the mascot and the
// action card, because the question underneath is the same in both: where is
// the body clock, how far off is it, and what is the one thing to do now.
//
// Everything on this screen is derived from real state: the plans the crew
// locked, the verdicts the scorer returned, the calendar the traveller gave
// us. There is no second solver here and no demo data in the copy — the
// numbers come from `computeTripTrajectory`, the same place the rest of the
// app gets them from.

import { useMemo, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import { type MascotTone } from "@/domain/mascot";
import type { EpistemicTag } from "@/domain/evidence";
import { computeTripTrajectory, directionOptions } from "@/domain/misalignment";
import { buildShiftWeekPlan } from "@/domain/shift-work";
import type {
  CalendarEvent,
  Citation,
  DayPlan,
  EvalResult,
  Trip,
  WearableBaseline,
} from "@/domain/types";
import { CircadianDial, type DialCommitmentNotch, type DialMark } from "./CircadianDial";
import { DailyActionCard, type DailyAction, type PlanStatus } from "./DailyActionCard";
import { HoldToConfirm } from "./HoldToConfirm";
import {
  MeridianOnboarding,
  type OnboardingState,
} from "./MeridianOnboarding";

export type MeridianMode = "TRIP" | "SHIFT";

export interface MeridianDailyScreenProps {
  mode: MeridianMode;
  onChangeMode: (mode: MeridianMode) => void;
  trip: Trip | null;
  /** The locked plans, keyed by day label. */
  locked: Map<string, DayPlan>;
  /** The plans still being scored, keyed by day label. */
  drafts: Map<string, { plan: DayPlan }>;
  /** The scorer's verdicts, keyed by day label. */
  verdicts: Map<string, EvalResult[]>;
  baseline?: WearableBaseline;
  /**
   * Where the baseline came from. This is the difference between "Measured"
   * and a demo fixture wearing a measured label: the sample baseline is not
   * the traveller's data, and the dial says "Unknown" rather than borrowing
   * someone else's provenance.
   */
  baselineProvenance?: "garmin" | "self-reported" | "demo" | "unknown";
  calendarEvents: CalendarEvent[];
  citations: Citation[];
  selectedDayLabel: string;
  onSelectDay: (label: string) => void;
  onStartCrewSync: () => void;
  /** Whether the traveller's baseline is still the demo one. */
  preview?: boolean;
}

export function MeridianDailyScreen({
  mode,
  onChangeMode,
  trip,
  locked,
  drafts,
  verdicts,
  baseline,
  baselineProvenance = "unknown",
  calendarEvents,
  citations,
  selectedDayLabel,
  onSelectDay,
  onStartCrewSync,
  preview,
}: MeridianDailyScreenProps) {
  const [tone, setTone] = useState<MascotTone>("cheeky");
  const [skippedDays, setSkippedDays] = useState<Set<number>>(new Set());
  const [alcoholDays, setAlcoholDays] = useState<Set<number>>(new Set());
  const [done, setDone] = useState(false);
  const [partnerCovers, setPartnerCovers] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  /**
   * The traveller's own answers, when they have given any. Kept apart from
   * the baseline prop so a self-report overrides a demo fixture instead of
   * being averaged into it — and so the provenance tag can say which one the
   * number came from.
   */
  const [selfReport, setSelfReport] = useState<{
    bedtimeMin: number;
    wakeMin: number;
    chronotype: WearableBaseline["chronotype"];
  } | null>(null);
  const [wearableOptedIn, setWearableOptedIn] = useState(false);

  // Every plan we have, in day order — the input the projection needs.
  const plans: DayPlan[] = useMemo(() => {
    const out: DayPlan[] = [];
    for (const spec of trip?.days ?? []) {
      const p = locked.get(spec.label) ?? drafts.get(spec.label)?.plan;
      if (p) out.push(p);
    }
    return out;
  }, [trip, locked, drafts]);

  /** The baseline the model uses: the traveller's own answer when they have
   *  given one, the wearable's when they have imported one, the run's
   *  baseline otherwise. */
  const effectiveBaseline = useMemo<WearableBaseline | undefined>(() => {
    if (!baseline) return undefined;
    if (selfReport) {
      return {
        ...baseline,
        avgBedtimeMin: selfReport.bedtimeMin,
        avgWakeMin: selfReport.wakeMin,
        chronotype: selfReport.chronotype,
        source: "You told us",
      };
    }
    if (wearableOptedIn) {
      return { ...baseline, source: "Wearable import (simulated)" };
    }
    return baseline;
  }, [baseline, selfReport, wearableOptedIn]);

  const traj = useMemo(() => {
    if (!trip || !effectiveBaseline) return [];
    return computeTripTrajectory({
      trip,
      days: plans,
      baseline: effectiveBaseline,
      calendar: calendarEvents,
      skippedDayIndices: skippedDays,
      alcoholDayIndices: alcoholDays,
    });
  }, [trip, effectiveBaseline, plans, calendarEvents, skippedDays, alcoholDays]);

  const shiftWeek = useMemo(
    () =>
      buildShiftWeekPlan({
        partnerCoversAfternoonPickup: partnerCovers,
        skippedDayIndices: skippedDays,
        alcoholDayIndices: alcoholDays,
      }),
    [partnerCovers, skippedDays, alcoholDays],
  );


  /** The tag on the dial's number: where the input came from. */
  const provenance: EpistemicTag =
    wearableOptedIn && selfReport === null
      ? "Measured"
      : selfReport
        ? "You told us"
        : baselineProvenance === "demo" || baselineProvenance === "unknown"
          ? "Unknown"
          : "You told us";

  const spec = trip?.days.find((d) => d.label === selectedDayLabel) ?? trip?.days[0];
  const point = traj.find((t) => t.dayIndex === spec?.dayIndex) ?? traj[0];

  const onboarding = (
    <>
      <div className="dial-actions">
        <button
          type="button"
          className="dial-btn"
          onClick={() => setOnboardingOpen(true)}
        >
          Set up your clock
        </button>
      </div>
      <MeridianOnboarding
        open={onboardingOpen}
        state={{
          mode,
          bedtimeMin: selfReport?.bedtimeMin ?? baseline?.avgBedtimeMin ?? 23 * 60 + 55,
          wakeMin: selfReport?.wakeMin ?? baseline?.avgWakeMin ?? 6 * 60 + 45,
          chronotype: selfReport?.chronotype ?? baseline?.chronotype ?? "neutral",
          wearableOptedIn,
          tone,
          protect: [],
        }}
        onChange={(next: OnboardingState) => {
          setTone(next.tone);
          setWearableOptedIn(next.wearableOptedIn);
          if (next.mode !== mode) onChangeMode(next.mode);
          // The answers land on the model as they are given, not at the end.
          setSelfReport({
            bedtimeMin: next.bedtimeMin,
            wakeMin: next.wakeMin,
            chronotype: next.chronotype,
          });
        }}
        onClose={() => setOnboardingOpen(false)}
        onComplete={() => setOnboardingOpen(false)}
        commitments={calendarEvents.map((e) => ({
          id: e.id,
          title: e.title,
          startMin: e.startMin,
          endMin: e.endMin,
          movable: e.movable,
        }))}
        reveal={
          point
            ? {
                baseline: {
                  bedtimeMin: effectiveBaseline?.avgBedtimeMin ?? 0,
                  wakeMin: effectiveBaseline?.avgWakeMin ?? 0,
                  source:
                    wearableOptedIn && !selfReport
                      ? ("measured" as const)
                      : ("self-reported" as const),
                },
                target: {
                  bedtimeMin: point.targetBedMin,
                  wakeMin: point.targetWakeMin,
                  label: trip
                    ? `The night you are aiming at (${trip.destination.name} time)`
                    : "The night you are aiming at",
                },
                misalignmentHours: point.misalignmentHours,
                baselineMisalignmentHours: point.baselineMisalignmentHours,
              }
            : undefined
        }
      />
    </>
  );

  if (mode === "SHIFT") {
    return (
      <>
      <ShiftScreen
        week={shiftWeek}
        tone={tone}
        onChangeTone={setTone}
        partnerCovers={partnerCovers}
        onPartnerCovers={setPartnerCovers}
        onChangeMode={onChangeMode}
        skippedDays={skippedDays}
        alcoholDays={alcoholDays}
        onToggleSkipped={(i) =>
          setSkippedDays((prev) => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
          })
        }
        onToggleAlcohol={(i) =>
          setAlcoholDays((prev) => {
            const next = new Set(prev);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            return next;
          })
        }
        provenance={provenance}
      />
      {onboarding}
      </>
    );
  }

  const plan = locked.get(selectedDayLabel) ?? drafts.get(selectedDayLabel)?.plan;
  const verdictList = verdicts.get(selectedDayLabel) ?? [];
  const verdict = verdictList[verdictList.length - 1];

  if (!trip || !baseline || !spec || !point) {
    return (
      <section className="dial" aria-label="Your clock">
        <h3 className="dial-title">Your clock</h3>
        <p className="dial-sub">
          The clock needs a trip and a baseline. Set the trip up and the crew will
          bring the plan; the body clock follows from it.
        </p>
        <div className="dial-actions">
          <button type="button" className="dial-btn" onClick={onStartCrewSync}>
            Run the crew
          </button>
          <button type="button" className="dial-btn" onClick={() => onChangeMode("SHIFT")}>
            Working shifts instead?
          </button>
        </div>
      </section>
    );
  }

  const commitments: DialCommitmentNotch[] = calendarEvents
    .filter((e) => (e.movedTo?.dayIndex ?? e.dayIndex) === point.dayIndex)
    .map((e) => ({
      id: e.id,
      title: e.title,
      startMin: e.movedTo?.startMin ?? e.startMin,
      endMin: e.movedTo?.endMin ?? e.endMin,
      fixed: !e.movable,
    }));

  const marks: DialMark[] = (plan?.interventions ?? [])
    .filter((iv) => iv.kind !== "sleep_window")
    .map((iv, i) => ({
      id: `${iv.kind}-${i}`,
      kind: iv.kind,
      label: iv.kind.replace(/_/g, " "),
      startMin: iv.startMin,
      endMin: iv.endMin,
      note: iv.note,
      isPrimary: iv.kind === "light_exposure",
    }));

  const lightIv = plan?.interventions.find((iv) => iv.kind === "light_exposure");
  const sleepIv = plan?.interventions.find((iv) => iv.kind === "sleep_window");
  const conflict = point.commitmentConflicts[0];

  const action: DailyAction = lightIv
    ? {
        id: `${spec.label}-light`,
        kind: "light_exposure",
        title:
          trip.direction === "west"
            ? "Get late-afternoon light"
            : "Step into bright morning light",
        timeWindow: `${fmtMin(lightIv.startMin)}–${fmtMin(lightIv.endMin ?? lightIv.startMin + 60)}`,
        startMin: lightIv.startMin,
        endMin: lightIv.endMin,
        shortReason:
          trip.direction === "west"
            ? "Evening light delays the clock toward the destination's evening."
            : "Light after waking advances the clock toward the destination's morning.",
        epistemicTag: "Recommended",
        constraintNote: conflict?.tradeOffNote,
      }
    : {
        id: `${spec.label}-sleep`,
        kind: "sleep_window",
        title: `Target sleep ${fmtMin(point.targetBedMin)} – ${fmtMin(point.targetWakeMin)}`,
        timeWindow: `${fmtMin(point.targetBedMin)} – ${fmtMin(point.targetWakeMin)}`,
        startMin: point.targetBedMin,
        endMin: point.targetWakeMin,
        shortReason: "The dark window carries the shift — everything else lands around it.",
        epistemicTag: "Recommended",
        constraintNote: conflict?.tradeOffNote,
      };

  const status: PlanStatus = !verdict
    ? "proposed"
    : verdict.feasible
      ? "checked"
      : "failed";
  const statusNote = verdict?.violations?.[0]?.message;

  const options = directionOptions(trip, effectiveBaseline?.chronotype ?? "neutral");

  return (
    <div className="flex flex-col gap-4">
      <div className="dial-actions" role="group" aria-label="Plan mode">
        <button
          type="button"
          className="dial-btn"
          aria-pressed={true}
          onClick={() => onChangeMode("TRIP")}
        >
          Travelling
        </button>
        <button
          type="button"
          className="dial-btn"
          aria-pressed={false}
          onClick={() => onChangeMode("SHIFT")}
        >
          Shift work
        </button>
        <span className="dial-sub">
          {options[0].executable
            ? options[0].note
            : options[1].note}
        </span>
      </div>

      <div className="dial-actions" role="group" aria-label="Day">
        <button
          type="button"
          className="dial-btn"
          onClick={() => {
            const i = trip.days.findIndex((d) => d.label === selectedDayLabel);
            const prev = trip.days[Math.max(0, i - 1)];
            if (prev) onSelectDay(prev.label);
          }}
        >
          ← Previous
        </button>
        {trip.days.map((d) => (
          <button
            key={d.label}
            type="button"
            className="dial-btn"
            aria-pressed={d.label === selectedDayLabel}
            onClick={() => onSelectDay(d.label)}
          >
            {d.label}
          </button>
        ))}
        <button
          type="button"
          className="dial-btn"
          onClick={() => {
            const i = trip.days.findIndex((d) => d.label === selectedDayLabel);
            const next = trip.days[Math.min(trip.days.length - 1, i + 1)];
            if (next) onSelectDay(next.label);
          }}
        >
          Next →
        </button>
      </div>

      <DailyActionCard
        action={action}
        status={status}
        statusNote={statusNote}
        isDone={done}
        onMarkDone={() => setDone((v) => !v)}
        isSkipped={skippedDays.has(point.dayIndex)}
        onSkip={() =>
          setSkippedDays((prev) => {
            const next = new Set(prev);
            if (next.has(point.dayIndex)) next.delete(point.dayIndex);
            else next.add(point.dayIndex);
            return next;
          })
        }
        alcoholActive={alcoholDays.has(point.dayIndex)}
        onToggleAlcohol={() =>
          setAlcoholDays((prev) => {
            const next = new Set(prev);
            if (next.has(point.dayIndex)) next.delete(point.dayIndex);
            else next.add(point.dayIndex);
            return next;
          })
        }
        citations={citations}
      />

      <CircadianDial
        dayLabel={spec.label}
        mode="TRIP"
        plannedSleep={{
          startMin: sleepIv?.startMin ?? point.planBedMin,
          endMin: sleepIv?.endMin ?? point.planWakeMin,
        }}
        targetNight={{ startMin: point.targetBedMin, endMin: point.targetWakeMin }}
        usualSleep={{
          startMin: baseline.avgBedtimeMin,
          endMin: baseline.avgWakeMin,
        }}
        estimatedBody={{ startMin: point.bodyBedMin, endMin: point.bodyWakeMin }}
        uncertaintyHalfWidthMin={point.uncertaintyHalfWidthMin}
        misalignmentHours={point.misalignmentHours}
        misalignmentLowHours={point.misalignmentLowHours}
        misalignmentHighHours={point.misalignmentHighHours}
        baselineMisalignmentHours={point.baselineMisalignmentHours}
        commitments={commitments}
        marks={marks}
        epistemicTag={provenance}
        tone={tone}
        onChangeTone={setTone}
        skippedToday={skippedDays.has(point.dayIndex)}
        onRepairSkip={() =>
          setSkippedDays((prev) => {
            const next = new Set(prev);
            next.delete(point.dayIndex);
            return next;
          })
        }
      />

      {preview && (
        <p className="dial-sub">
          These are sample numbers until you answer the wake question, so the clock
          is showing the demo baseline, not yours.
        </p>
      )}

      {onboarding}
    </div>
  );
}

/** SHIFT mode: the rotating week, the commitments, and the one movable thing. */
function ShiftScreen({
  week,
  tone,
  onChangeTone,
  partnerCovers,
  onPartnerCovers,
  onChangeMode,
  skippedDays,
  alcoholDays,
  onToggleSkipped,
  onToggleAlcohol,
  provenance,
}: {
  week: ReturnType<typeof buildShiftWeekPlan>;
  tone: MascotTone;
  onChangeTone: (t: MascotTone) => void;
  partnerCovers: boolean;
  onPartnerCovers: (v: boolean) => void;
  onChangeMode: (m: MeridianMode) => void;
  skippedDays: Set<number>;
  alcoholDays: Set<number>;
  onToggleSkipped: (dayIndex: number) => void;
  onToggleAlcohol: (dayIndex: number) => void;
  provenance: EpistemicTag;
}) {
  const [dayIndex, setDayIndex] = useState(0);
  const [doneDays, setDoneDays] = useState<Set<number>>(new Set());
  const day = week[dayIndex] ?? week[0];

  const commitments: DialCommitmentNotch[] = day.commitments
    .filter((c) => c.active)
    .map((c) => ({
      id: c.id,
      title: c.title,
      startMin: c.startMin,
      endMin: c.endMin,
      fixed: !c.negotiable,
      tradeOffNote: c.tradeOffIfKept,
    }));

  const marks: DialMark[] = day.secondaryMarks.map((m) => ({
    id: m.id,
    kind: m.kind,
    label: m.label,
    startMin: m.timeMin,
    note: m.note,
  }));

  const action: DailyAction = {
    id: day.primaryAction.id,
    kind: day.primaryAction.kind,
    title: day.primaryAction.title,
    timeWindow: day.primaryAction.timeWindow,
    startMin: day.primaryAction.startMin,
    endMin: day.primaryAction.endMin,
    shortReason: day.primaryAction.shortReason,
    epistemicTag: "Recommended",
    constraintNote: day.primaryAction.constraintNote,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="dial-actions" role="group" aria-label="Plan mode">
        <button
          type="button"
          className="dial-btn"
          aria-pressed={false}
          onClick={() => onChangeMode("TRIP")}
        >
          Travelling
        </button>
        <button
          type="button"
          className="dial-btn"
          aria-pressed={true}
          onClick={() => onChangeMode("SHIFT")}
        >
          Shift work
        </button>
      </div>

      <div className="dial-actions" role="group" aria-label="Day">
        {week.map((d, i) => (
          <button
            key={d.label}
            type="button"
            className="dial-btn"
            aria-pressed={i === dayIndex}
            onClick={() => setDayIndex(i)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {day.postShiftSafetyWarning && (
        <p
          className="dac-note"
          role="note"
          style={{ borderColor: "var(--dial-committed)" }}
        >
          {day.postShiftSafetyWarning}
        </p>
      )}

      <DailyActionCard
        action={action}
        status="proposed"
        isDone={doneDays.has(day.dayIndex)}
        onMarkDone={() =>
          setDoneDays((prev) => {
            const next = new Set(prev);
            if (next.has(day.dayIndex)) next.delete(day.dayIndex);
            else next.add(day.dayIndex);
            return next;
          })
        }
        isSkipped={skippedDays.has(day.dayIndex)}
        onSkip={() => onToggleSkipped(day.dayIndex)}
        alcoholActive={alcoholDays.has(day.dayIndex)}
        onToggleAlcohol={() => onToggleAlcohol(day.dayIndex)}
        citations={[]}
      />

      <CircadianDial
        dayLabel={`${day.label} · ${day.dayTypeBadge}`}
        mode="SHIFT"
        plannedSleep={{
          startMin: day.plannedSleepStartMin,
          endMin: day.plannedSleepEndMin,
        }}
        targetNight={{ startMin: day.targetNightStartMin, endMin: day.targetNightEndMin }}
        usualSleep={{
          startMin: day.usualSleepStartMin,
          endMin: day.usualSleepEndMin,
        }}
        estimatedBody={{
          startMin: day.estimatedBodySleepStartMin,
          endMin: day.estimatedBodySleepEndMin,
        }}
        uncertaintyHalfWidthMin={day.uncertaintyHalfWidthMin}
        misalignmentHours={day.misalignmentHours}
        metricLabel="of delay owed"
        misalignmentLowHours={day.misalignmentLowHours}
        misalignmentHighHours={day.misalignmentHighHours}
        baselineMisalignmentHours={day.baselineMisalignmentHours}
        commitments={commitments}
        marks={marks}
        epistemicTag={provenance}
        tone={tone}
        onChangeTone={onChangeTone}
        skippedToday={false}
        onRepairSkip={() => undefined}
        isShiftPostNightWarning={Boolean(day.postShiftSafetyWarning)}
      />

      <section className="dial" aria-label="Commitments">
        <h3 className="dial-title">This week&apos;s commitments</h3>
        <ul className="dial-list">
          {day.commitments.map((c) => (
            <li className="dial-list-row" key={c.id}>
              <span>
                {c.title} ({c.negotiable ? "negotiable" : "fixed"})
              </span>
              <span>
                {fmtMin(c.startMin)}–{fmtMin(c.endMin)}
              </span>
            </li>
          ))}
        </ul>
        <p className="dial-sub">{day.honestTradeOffNote}</p>
        <div className="dial-actions">
          <HoldToConfirm
            label={
              partnerCovers
                ? "✓ Partner covers the 15:30 pickup"
                : "Hold to hand over the 15:30 pickup"
            }
            holdingLabel="Hold to hand over the pickup"
            pressed={partnerCovers}
            onConfirm={() => onPartnerCovers(!partnerCovers)}
          />
        </div>
        <p className="dial-sub">
          Handing the pickup over buys an hour of sleep before the last night
          shift. It is a trade, so it takes a hold rather than a tap.
        </p>
      </section>
    </div>
  );
}
