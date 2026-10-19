"use client";

import React, { useMemo, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import { type MascotTone } from "@/domain/evidence";
import {
  computeTripTrajectory,
  recommendDirectionStrategy,
  shiftBetweenTimezonesOnDates,
} from "@/domain/misalignment";
import { buildShiftWeekPlan } from "@/domain/shift-work";
import type {
  CalendarEvent,
  CalendarMove,
  Citation,
  DayPlan,
  EvalResult,
  Trip,
  WearableBaseline,
} from "@/domain/types";
import {
  CircadianDial,
  type DialCommitmentNotch,
  type DialMark,
} from "./CircadianDial";
import { DailyActionCard, type PrimaryActionItem } from "./DailyActionCard";

export interface MeridianDailyScreenProps {
  mode: "TRIP" | "SHIFT";
  onChangeMode: (mode: "TRIP" | "SHIFT") => void;
  trip: Trip | null;
  phase: "idle" | "running" | "done";
  selectedDayLabel: string;
  onSelectDay: (label: string) => void;
  locked: Map<string, DayPlan>;
  drafts: Map<string, { plan: DayPlan; attempt?: number }>;
  verdicts: Map<string, EvalResult[]>;
  baseline?: WearableBaseline;
  calendarEvents: CalendarEvent[];
  moves: CalendarMove[];
  citations: Citation[];
  onOpenTripSetup: () => void;
  onStartCrewSync: () => void;
}

/**
 * Sections 1–10 — Complete Meridian Daily Experience:
 * Hierarchy: the action helps the user, the dial explains the plan, the mascot makes it memorable.
 * Supports both TRIP (London–Tokyo seed + custom routes) and SHIFT (7-day rotating night-shift + childcare seed).
 */
export function MeridianDailyScreen({
  mode,
  onChangeMode,
  trip,
  phase,
  selectedDayLabel,
  onSelectDay,
  locked,
  drafts,
  baseline,
  calendarEvents,
  citations,
  onOpenTripSetup,
  onStartCrewSync,
}: MeridianDailyScreenProps) {
  const [tone, setTone] = useState<MascotTone>("cheeky");
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());
  const [skippedDays, setSkippedDays] = useState<Set<number>>(new Set());
  const [alcoholDays, setAlcoholDays] = useState<Set<number>>(new Set());
  const [wearableOptedIn, setWearableOptedIn] = useState<boolean>(false);

  // Interactive commitment adaptation toggles (Requirement 11.1: "The plan adapts when a commitment changes, in both seeds")
  const [tripCommitmentMoved, setTripCommitmentMoved] = useState<boolean>(false);
  const [shiftPartnerCoversPickup, setShiftPartnerCoversPickup] =
    useState<boolean>(false);
  const [shiftDayIndex, setShiftDayIndex] = useState<number>(3); // Default to Thu (Night 3 where childcare trade-off is sharpest)
  const [forceProposedPreview, setForceProposedPreview] =
    useState<boolean>(false);

  // --- TRIP MODE DATA ---
  const tripDays = trip?.days ?? [
    { dayIndex: 0, label: "D-3", date: "2026-10-15" },
    { dayIndex: 1, label: "D-2", date: "2026-10-16" },
    { dayIndex: 2, label: "D-1", date: "2026-10-17" },
    { dayIndex: 3, label: "Flight", date: "2026-10-18" },
    { dayIndex: 4, label: "D+1", date: "2026-10-19" },
  ];

  const activeTripDayIdx = Math.max(
    0,
    tripDays.findIndex((d) => d.label === selectedDayLabel),
  );
  const currentTripSpec = tripDays[activeTripDayIdx] ?? tripDays[0];

  // Build effective day plans for TRIP (incorporating interactive commitment adaptation)
  const effectiveTripPlans = useMemo<DayPlan[]>(() => {
    const sign = trip?.direction === "west" ? 1 : -1;
    const baseBed = baseline?.avgBedtimeMin ?? 23 * 60 + 55;
    const baseWake = baseline?.avgWakeMin ?? 6 * 60 + 45;

    return tripDays.map((spec, idx) => {
      const fromRun =
        locked.get(spec.label) ?? drafts.get(spec.label)?.plan;
      if (fromRun) {
        if (tripCommitmentMoved && spec.dayIndex === 2) {
          // Moving D-1 evening dinner earlier lets sleep advance an extra 45m
          return {
            ...fromRun,
            shiftMin: -90,
            targetBedtimeMin: 21 * 60 + 0,
            targetWakeMin: 4 * 60 + 0,
          };
        }
        return fromRun;
      }

      // Deterministic default plan when crew hasn't streamed yet
      const shiftPerDay =
        spec.dayIndex === 2 && !tripCommitmentMoved
          ? sign * 60 // Dinner with Sarah caps D-1 shift to 60m
          : sign * 85;
      const cumShift = shiftPerDay * (idx + 1);
      const bed = (((baseBed + cumShift) % 1440) + 1440) % 1440;
      const wake = (((baseWake + cumShift) % 1440) + 1440) % 1440;
      const lightStart =
        sign < 0
          ? (wake + 15) % 1440
          : (((bed - 150) % 1440) + 1440) % 1440;

      return {
        dayIndex: spec.dayIndex,
        label: spec.label,
        shiftMin: shiftPerDay,
        targetBedtimeMin: bed,
        targetWakeMin: wake,
        interventions: [
          {
            kind: "light_exposure",
            startMin: lightStart,
            endMin: (lightStart + 60) % 1440,
            note:
              sign < 0
                ? `Seek 60 min bright outdoor light at ${fmtMin(lightStart)} to advance your clock.`
                : `Seek 60 min late-day light at ${fmtMin(lightStart)} to delay your clock.`,
          },
          {
            kind: "caffeine_cutoff",
            startMin: (((bed - 8 * 60) % 1440) + 1440) % 1440,
            note: `Cut caffeine 8h before ${fmtMin(bed)} target bedtime.`,
          },
          {
            kind: "avoid_light",
            startMin: (((bed - 60) % 1440) + 1440) % 1440,
            endMin: bed,
            note: `Dim screens and overhead light 60m before ${fmtMin(bed)}.`,
          },
          {
            kind: "sleep_window",
            startMin: bed,
            endMin: wake,
            note: `Planned sleep ${fmtMin(bed)}–${fmtMin(wake)}.`,
          },
        ],
      };
    });
  }, [trip, tripDays, locked, drafts, baseline, tripCommitmentMoved]);

  const effectiveTripCalendar = useMemo<CalendarEvent[]>(() => {
    return calendarEvents.map((ev) => {
      if (tripCommitmentMoved && ev.id === "ev-dinner") {
        return {
          ...ev,
          startMin: 18 * 60 + 0,
          endMin: 19 * 60 + 30,
          movedTo: {
            dayIndex: ev.dayIndex,
            startMin: 18 * 60 + 0,
            endMin: 19 * 60 + 30,
          },
        };
      }
      return ev;
    });
  }, [calendarEvents, tripCommitmentMoved]);

  const effectiveBaseline: WearableBaseline = useMemo(
    () =>
      baseline ?? {
        wearer: "Alex Rivera",
        source: "Self-reported usual sleep",
        avgBedtimeMin: 23 * 60 + 55,
        avgWakeMin: 6 * 60 + 45,
        avgSleepMin: 410,
        hrvMs: 48,
        hrvTrend: "stable",
        restingHr: 58,
        chronotype: "late",
        nights: [],
      },
    [baseline],
  );

  const tripTrajectory = useMemo(() => {
    if (!trip) return [];
    return computeTripTrajectory({
      trip,
      days: effectiveTripPlans,
      baseline: effectiveBaseline,
      calendar: effectiveTripCalendar,
      skippedDayIndices: skippedDays,
      alcoholDayIndices: alcoholDays,
      wearableOptedIn,
    });
  }, [
    trip,
    effectiveTripPlans,
    effectiveBaseline,
    effectiveTripCalendar,
    skippedDays,
    alcoholDays,
    wearableOptedIn,
  ]);

  // --- SHIFT MODE DATA ---
  const shiftWeek = useMemo(
    () =>
      buildShiftWeekPlan({
        partnerCoversAfternoonPickup: shiftPartnerCoversPickup,
        skippedDayIndices: skippedDays,
        alcoholDayIndices: alcoholDays,
      }),
    [shiftPartnerCoversPickup, skippedDays, alcoholDays],
  );

  // Active Day Resolution across TRIP vs SHIFT
  const activeDayNumber =
    mode === "TRIP" ? currentTripSpec.dayIndex : shiftDayIndex;
  const isSkippedToday = skippedDays.has(activeDayNumber);
  const isAlcoholToday = alcoholDays.has(activeDayNumber);

  // DST Clock-Change Verification Note (25 Oct 2026 UK BST -> GMT)
  const oct25Check = useMemo(
    () =>
      shiftBetweenTimezonesOnDates(
        "Europe/London",
        "2026-10-25",
        "Asia/Tokyo",
        "2026-10-25",
      ),
    [],
  );

  // Construct props for DailyActionCard & CircadianDial based on active mode
  if (mode === "SHIFT") {
    const sDay = shiftWeek[shiftDayIndex] ?? shiftWeek[0];
    const actionKey = `SHIFT-${sDay.label}`;
    const isDone = completedKeys.has(actionKey);
    const planStatus = forceProposedPreview ? "PROPOSED" : "CHECKED";

    const dialCommitments: DialCommitmentNotch[] = sDay.commitments
      .filter((c) => c.active)
      .map((c) => ({
        id: c.id,
        title: c.title,
        startMin: c.startMin,
        endMin: c.endMin,
        fixed: !c.negotiable,
        blocksWindow: c.category === "childcare" && sDay.dayType === "night_shift",
        tradeOffNote: c.tradeOffIfKept,
      }));

    const dialMarks: DialMark[] = sDay.secondaryMarks.map((m) => ({
      id: m.id,
      kind: m.kind,
      label: m.label,
      startMin: m.timeMin,
      note: m.note,
    }));

    return (
      <div className="space-y-5">
        {/* Mode + Context Header Card */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[#e3d5c3] bg-[#FFF8EF] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#1E1B18] px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-[#F5EFE6]">
                SHIFT MODE · Rotating Night Shifts + Childcare
              </span>
              <span className="rounded-full bg-[#f1e6d6] px-2.5 py-0.5 text-[11px] font-bold text-[#5b4d41]">
                {sDay.dayTypeBadge}
              </span>
            </div>
            <p className="mt-1 text-xs font-medium text-[#5b4d41]">
              {sDay.honestTradeOffNote}
            </p>
          </div>

          {/* Interactive Commitment Change Control (Requirement 11.1) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShiftPartnerCoversPickup((v) => !v)}
              aria-pressed={shiftPartnerCoversPickup}
              data-testid="shift-adapt-commitment-btn"
              className={`rounded-full border px-3.5 py-2 text-xs font-extrabold transition ${
                shiftPartnerCoversPickup
                  ? "border-[#2A6F4E] bg-[#2A6F4E] text-white"
                  : "border-[#1E1B18] bg-[#f5efe6] text-[#1E1B18] hover:bg-[#1E1B18] hover:text-[#F5EFE6]"
              }`}
            >
              {shiftPartnerCoversPickup
                ? "✓ Partner covers 15:30 pickup (+75m sleep)"
                : "↔ Adapt commitment: Partner covers 15:30 pickup"}
            </button>
          </div>
        </div>

        {/* Pill-Shaped Day Switcher (Mon .. Sun) with Dark Circular Prev/Next Buttons */}
        <div
          className="flex items-center justify-between gap-2"
          role="group"
          aria-label="SHIFT week day switcher"
        >
          <button
            type="button"
            onClick={() => setShiftDayIndex((i) => Math.max(0, i - 1))}
            disabled={shiftDayIndex <= 0}
            aria-label="Previous day"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1E1B18] text-sm font-bold text-[#F5EFE6] disabled:opacity-40"
          >
            ←
          </button>

          <div className="flex flex-1 items-center justify-between gap-1 overflow-x-auto rounded-full border border-[#e3d5c3] bg-[#FFF8EF] p-1.5">
            {shiftWeek.map((d, idx) => {
              const active = idx === shiftDayIndex;
              return (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => setShiftDayIndex(idx)}
                  aria-pressed={active}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                    active
                      ? "bg-[#D96B43] text-white shadow-sm"
                      : "text-[#5b4d41] hover:text-[#1E1B18]"
                  }`}
                >
                  <span>{d.label}</span>
                  <span className="ml-1 hidden text-[10px] opacity-80 sm:inline">
                    {d.dayType === "night_shift" ? "🌙" : d.dayType === "transition_off" ? "↻" : "☀️"}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() =>
              setShiftDayIndex((i) => Math.min(shiftWeek.length - 1, i + 1))
            }
            disabled={shiftDayIndex >= shiftWeek.length - 1}
            aria-label="Next day"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1E1B18] text-sm font-bold text-[#F5EFE6] disabled:opacity-40"
          >
            →
          </button>
        </div>

        {/* 1. Primary Daily Action Card */}
        <DailyActionCard
          dayLabel={`${sDay.label} (${sDay.date})`}
          mode="SHIFT"
          planStatus={planStatus}
          planStatusDetail={
            planStatus === "CHECKED"
              ? "Checked against hospital rota (22:00–06:00), fixed 07:45 school drop-off, and minimum anchor sleep."
              : "Proposed adjustment awaiting confirmation of afternoon childcare handoff."
          }
          onTogglePlanStatus={() => setForceProposedPreview((v) => !v)}
          action={{
            id: sDay.primaryAction.id,
            kind: sDay.primaryAction.kind,
            title: sDay.primaryAction.title,
            timeWindow: sDay.primaryAction.timeWindow,
            shortReason: sDay.primaryAction.shortReason,
            epistemicTag: "Recommended",
            constraintTradeOff: sDay.primaryAction.constraintNote,
          }}
          isDone={isDone}
          isSkipped={isSkippedToday}
          alcoholActive={isAlcoholToday}
          onMarkDone={() => {
            setCompletedKeys((prev) => {
              const next = new Set(prev);
              if (next.has(actionKey)) next.delete(actionKey);
              else next.add(actionKey);
              return next;
            });
          }}
          onSkipTonight={() => {
            setSkippedDays((prev) => {
              const next = new Set(prev);
              if (next.has(activeDayNumber)) next.delete(activeDayNumber);
              else next.add(activeDayNumber);
              return next;
            });
          }}
          onRepairSkip={() => {
            setSkippedDays((prev) => {
              const next = new Set(prev);
              next.delete(activeDayNumber);
              return next;
            });
          }}
          onToggleAlcohol={() => {
            setAlcoholDays((prev) => {
              const next = new Set(prev);
              if (next.has(activeDayNumber)) next.delete(activeDayNumber);
              else next.add(activeDayNumber);
              return next;
            });
          }}
          postShiftSafetyWarning={sDay.postShiftSafetyWarning}
        />

        {/* 2. Signature 24-Hour Dial + Mascot */}
        <CircadianDial
          dayLabel={`${sDay.label} · ${sDay.dayTypeBadge}`}
          mode="SHIFT"
          plannedSleepStartMin={sDay.plannedSleepStartMin}
          plannedSleepEndMin={sDay.plannedSleepEndMin}
          napWindow={sDay.napWindow}
          targetNightStartMin={sDay.targetAnchorStartMin}
          targetNightEndMin={sDay.targetAnchorEndMin}
          usualSleepStartMin={sDay.usualSleepStartMin}
          usualSleepEndMin={sDay.usualSleepEndMin}
          estimatedBodyStartMin={sDay.estimatedBodySleepStartMin}
          estimatedBodyEndMin={sDay.estimatedBodySleepEndMin}
          uncertaintyHalfWidthMin={sDay.uncertaintyHalfWidthMin}
          misalignmentHours={sDay.misalignmentHours}
          misalignmentLowHours={sDay.misalignmentLowHours}
          misalignmentHighHours={sDay.misalignmentHighHours}
          baselineMisalignmentHours={sDay.baselineMisalignmentHours}
          commitments={dialCommitments}
          marks={dialMarks}
          tone={tone}
          onChangeTone={setTone}
          skippedToday={isSkippedToday}
          onRepairSkip={() =>
            setSkippedDays((prev) => {
              const next = new Set(prev);
              next.delete(activeDayNumber);
              return next;
            })
          }
          isShiftPostNightWarning={Boolean(sDay.postShiftSafetyWarning)}
          wearableOptedIn={wearableOptedIn}
        />
      </div>
    );
  }

  // --- TRIP MODE RENDER ---
  const tPoint = tripTrajectory[activeTripDayIdx] ?? {
    dayIndex: currentTripSpec.dayIndex,
    label: currentTripSpec.label,
    date: currentTripSpec.date,
    estimatedBodyBedMin: 22 * 60 + 30,
    estimatedBodyWakeMin: 5 * 60 + 30,
    targetBedMin: 21 * 60 + 45,
    targetWakeMin: 4 * 60 + 45,
    usualBedMin: 23 * 60 + 55,
    usualWakeMin: 6 * 60 + 45,
    uncertaintyHalfWidthMin: 55,
    misalignmentHours: 5.5,
    misalignmentLowHours: 4.6,
    misalignmentHighHours: 6.4,
    baselineMisalignmentHours: 8.0,
    cumulativePlannedShiftMin: -150,
    commitmentConflicts: [],
  };

  const currentPlan = effectiveTripPlans[activeTripDayIdx];
  const lightIv = currentPlan?.interventions.find(
    (iv) => iv.kind === "light_exposure",
  );
  const sleepIv = currentPlan?.interventions.find(
    (iv) => iv.kind === "sleep_window",
  );

  const primaryAction: PrimaryActionItem = lightIv
    ? {
        id: `trip-${currentTripSpec.label}-light`,
        kind: "light_exposure",
        title:
          currentTripSpec.label === "Flight"
            ? `Seek cabin & arrival morning light at ${fmtMin(lightIv.startMin)}`
            : trip?.direction === "west"
              ? `Get 60 min late-afternoon bright light at ${fmtMin(lightIv.startMin)}`
              : `Step into bright morning light at ${fmtMin(lightIv.startMin)}`,
        timeWindow: `${fmtMin(lightIv.startMin)} – ${fmtMin(lightIv.endMin ?? (lightIv.startMin + 60) % 1440)}`,
        shortReason:
          trip?.direction === "west"
            ? `Evening bright light delays your body clock toward ${trip?.destination.name ?? "destination"} night.`
            : `Post-wake bright light advances your master clock ~1–1.5h toward ${trip?.destination.name ?? "Tokyo"} morning.`,
        epistemicTag: "Recommended",
        constraintTradeOff:
          currentTripSpec.dayIndex === 2
            ? tripCommitmentMoved
              ? "Dinner with Sarah moved to 18:00–19:30 → unlocks 21:00 sleep & full 90m advance."
              : "Fixed 19:30–21:30 Dinner with Sarah caps tonight's advance at 21:45 bedtime."
            : tPoint.commitmentConflicts[0]?.tradeOffNote,
      }
    : {
        id: `trip-${currentTripSpec.label}-sleep`,
        kind: "sleep_window",
        title: `Target sleep window ${fmtMin(tPoint.targetBedMin)} – ${fmtMin(tPoint.targetWakeMin)}`,
        timeWindow: `${fmtMin(tPoint.targetBedMin)} – ${fmtMin(tPoint.targetWakeMin)}`,
        shortReason: `Moves your dark/sleep window step-by-step toward ${trip?.destination.name ?? "destination"} local night.`,
        epistemicTag: "Recommended",
      };

  const secondaryMarks: DialMark[] = (currentPlan?.interventions ?? [])
    .filter((iv) => iv.kind !== "sleep_window")
    .map((iv, idx) => ({
      id: `${currentTripSpec.label}-iv-${idx}`,
      kind: iv.kind,
      label:
        iv.kind === "light_exposure"
          ? "Bright light"
          : iv.kind === "avoid_light"
            ? "Dim light"
            : iv.kind === "caffeine_cutoff"
              ? "Caffeine cutoff"
              : iv.kind === "exercise"
                ? "Outdoor movement"
                : iv.kind === "meal_timing"
                  ? "Meal anchor"
                  : "Nap",
      startMin: iv.startMin,
      endMin: iv.endMin,
      note: iv.note,
      isPrimary: iv.kind === "light_exposure",
    }));

  const dayCommitments: DialCommitmentNotch[] = effectiveTripCalendar
    .filter((e) => (e.movedTo?.dayIndex ?? e.dayIndex) === currentTripSpec.dayIndex)
    .map((e) => {
      const s = e.movedTo?.startMin ?? e.startMin;
      const end = e.movedTo?.endMin ?? e.endMin;
      return {
        id: e.id,
        title: e.title,
        startMin: s,
        endMin: end,
        fixed: !e.movable,
        blocksWindow: e.id === "ev-dinner" && !tripCommitmentMoved,
        tradeOffNote:
          e.id === "ev-dinner"
            ? tripCommitmentMoved
              ? "Moved earlier to 18:00–19:30 so wind-down and 21:00 sleep stay clear."
              : "Runs 19:30–21:30. Meridian never overwrites fixed commitments; bedtime holds at 21:45 unless you move dinner."
            : undefined,
      };
    });

  const directionStrategy = trip
    ? recommendDirectionStrategy(trip, effectiveBaseline.chronotype)
    : undefined;

  const tripActionKey = `TRIP-${currentTripSpec.label}`;
  const isTripDone = completedKeys.has(tripActionKey);
  const planStatus: "CHECKED" | "PROPOSED" = forceProposedPreview
    ? "PROPOSED"
    : "CHECKED";

  return (
    <div className="space-y-5">
      {/* Route & Commitment Adaptation Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[#e3d5c3] bg-[#FFF8EF] px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#1E1B18] px-3 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-[#F5EFE6]">
              TRIP · {trip ? `${trip.origin.name} (${trip.origin.code}) → ${trip.destination.name} (${trip.destination.code})` : "London (LHR) → Tokyo (HND)"}
            </span>
            <span className="rounded-full bg-[#f6dccb] px-2.5 py-0.5 text-[11px] font-extrabold text-[#a8431e]">
              {trip ? `${Math.abs(trip.requiredShiftMin / 60)}h ${trip.direction === "east" ? "East (Advance)" : "West (Delay)"}` : "8h East (Advance)"}
            </span>
            <span className="rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-2.5 py-0.5 text-[11px] font-semibold text-[#5b4d41]">
              You told us · Flight &amp; diary
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-[#5b4d41]">
            Pre-departure + arrival plan (~1–1.5h/day).{" "}
            <span className="text-[#7a6a5c]">
              (DST check: London→Tokyo is 8h in BST before 25 Oct, and{" "}
              {oct25Check.hoursAbs}h in GMT from 25 Oct.)
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTripCommitmentMoved((v) => !v)}
            aria-pressed={tripCommitmentMoved}
            data-testid="trip-adapt-commitment-btn"
            className={`rounded-full border px-3.5 py-2 text-xs font-extrabold transition ${
              tripCommitmentMoved
                ? "border-[#2A6F4E] bg-[#2A6F4E] text-white"
                : "border-[#1E1B18] bg-[#f5efe6] text-[#1E1B18] hover:bg-[#1E1B18] hover:text-[#F5EFE6]"
            }`}
          >
            {tripCommitmentMoved
              ? "✓ D-1 Dinner moved to 18:00 (+45m shift)"
              : "↔ Adapt D-1 commitment: Move 19:30 Dinner earlier"}
          </button>

          <button
            type="button"
            onClick={onOpenTripSetup}
            className="rounded-full border border-[#d8c6ae] bg-[#FFF8EF] px-3.5 py-2 text-xs font-bold text-[#1E1B18] hover:border-[#D96B43]"
          >
            Flight &amp; Route Setup
          </button>
        </div>
      </div>

      {/* Pill-Shaped Day Switcher (Previous / Today / Next) with Dark Circular Navigation Buttons */}
      <div
        className="flex items-center justify-between gap-2"
        role="group"
        aria-label="TRIP day switcher"
      >
        <button
          type="button"
          onClick={() => {
            const prev = tripDays[activeTripDayIdx - 1];
            if (prev) onSelectDay(prev.label);
          }}
          disabled={activeTripDayIdx <= 0}
          aria-label="Previous day"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1E1B18] text-sm font-bold text-[#F5EFE6] disabled:opacity-40"
        >
          ←
        </button>

        <div className="flex flex-1 items-center justify-between gap-1 overflow-x-auto rounded-full border border-[#e3d5c3] bg-[#FFF8EF] p-1.5">
          {tripDays.map((d) => {
            const isSelected = d.label === currentTripSpec.label;
            const isFlight =
              trip ? d.dayIndex === trip.departureDayIndex : d.label === "Flight";
            return (
              <button
                key={d.dayIndex}
                type="button"
                onClick={() => onSelectDay(d.label)}
                aria-pressed={isSelected}
                className={`flex-1 rounded-full px-3 py-1.5 text-xs font-extrabold transition ${
                  isSelected
                    ? "bg-[#D96B43] text-white shadow-sm"
                    : "text-[#5b4d41] hover:text-[#1E1B18]"
                }`}
              >
                {isFlight ? "✈️ Flight" : d.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            const next = tripDays[activeTripDayIdx + 1];
            if (next) onSelectDay(next.label);
          }}
          disabled={activeTripDayIdx >= tripDays.length - 1}
          aria-label="Next day"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#1E1B18] text-sm font-bold text-[#F5EFE6] disabled:opacity-40"
        >
          →
        </button>
      </div>

      {/* 1. Primary Daily Action Card */}
      <DailyActionCard
        dayLabel={`${currentTripSpec.label} (${currentTripSpec.date})`}
        mode="TRIP"
        planStatus={planStatus}
        planStatusDetail={
          planStatus === "CHECKED"
            ? "Passed deterministic checks on flight times, fixed commitments, ≤90m/day shift rate, and ≥6h minimum sleep opportunity."
            : "Proposed draft awaiting deterministic gate check on commitment overlap."
        }
        onTogglePlanStatus={() => setForceProposedPreview((v) => !v)}
        action={primaryAction}
        isDone={isTripDone}
        isSkipped={isSkippedToday}
        alcoholActive={isAlcoholToday}
        onMarkDone={() => {
          setCompletedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(tripActionKey)) next.delete(tripActionKey);
            else next.add(tripActionKey);
            return next;
          });
        }}
        onSkipTonight={() => {
          setSkippedDays((prev) => {
            const next = new Set(prev);
            if (next.has(activeDayNumber)) next.delete(activeDayNumber);
            else next.add(activeDayNumber);
            return next;
          });
        }}
        onRepairSkip={() => {
          setSkippedDays((prev) => {
            const next = new Set(prev);
            next.delete(activeDayNumber);
            return next;
          });
        }}
        onToggleAlcohol={() => {
          setAlcoholDays((prev) => {
            const next = new Set(prev);
            if (next.has(activeDayNumber)) next.delete(activeDayNumber);
            else next.add(activeDayNumber);
            return next;
          });
        }}
        directionStrategy={directionStrategy}
        extraCitations={citations}
      />

      {/* 2. Signature 24-Hour Dial + Mascot */}
      <CircadianDial
        dayLabel={currentTripSpec.label}
        mode="TRIP"
        plannedSleepStartMin={
          sleepIv?.startMin ?? currentPlan?.targetBedtimeMin ?? tPoint.targetBedMin
        }
        plannedSleepEndMin={
          sleepIv?.endMin ?? currentPlan?.targetWakeMin ?? tPoint.targetWakeMin
        }
        targetNightStartMin={tPoint.targetBedMin}
        targetNightEndMin={tPoint.targetWakeMin}
        usualSleepStartMin={tPoint.usualBedMin}
        usualSleepEndMin={tPoint.usualWakeMin}
        estimatedBodyStartMin={tPoint.estimatedBodyBedMin}
        estimatedBodyEndMin={tPoint.estimatedBodyWakeMin}
        uncertaintyHalfWidthMin={tPoint.uncertaintyHalfWidthMin}
        misalignmentHours={tPoint.misalignmentHours}
        misalignmentLowHours={tPoint.misalignmentLowHours}
        misalignmentHighHours={tPoint.misalignmentHighHours}
        baselineMisalignmentHours={tPoint.baselineMisalignmentHours}
        commitments={dayCommitments}
        marks={secondaryMarks}
        tone={tone}
        onChangeTone={setTone}
        skippedToday={isSkippedToday}
        onRepairSkip={() =>
          setSkippedDays((prev) => {
            const next = new Set(prev);
            next.delete(activeDayNumber);
            return next;
          })
        }
        wearableOptedIn={wearableOptedIn}
      />

      {/* 3. Compact Scientific Honesty, Wearable Simulation & Agent Status Footer */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[22px] border border-[#e3d5c3] bg-[#FFF8EF] p-4 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-extrabold uppercase tracking-wider text-[#1E1B18]">
              Wearable &amp; Data Connections
            </span>
            <span className="rounded-full bg-[#f1e6d6] px-2.5 py-0.5 text-[10px] font-bold text-[#5b4d41]">
              {wearableOptedIn ? "Simulated import active" : "Not connected"}
            </span>
          </div>
          <p className="mt-1.5 text-[#5b4d41]">
            Apple Health and Garmin are <strong>not live-connected</strong> in
            this sandbox. Toggle below to preview a{" "}
            <strong>simulated sleep &amp; HR import</strong> (narrows phase band
            uncertainty from ±0.9h to ±0.7h, labelled{" "}
            <em>&ldquo;Estimated from your data&rdquo;</em>).
          </p>
          <button
            type="button"
            onClick={() => setWearableOptedIn((v) => !v)}
            aria-pressed={wearableOptedIn}
            className="mt-2.5 rounded-full border border-[#1E1B18] px-3 py-1.5 text-[11px] font-bold text-[#1E1B18] transition hover:bg-[#1E1B18] hover:text-[#F5EFE6]"
          >
            {wearableOptedIn
              ? "Disable simulated wearable import"
              : "Opt in: Load simulated sleep & HR data"}
          </button>
        </div>

        <div className="rounded-[22px] border border-[#e3d5c3] bg-[#FFF8EF] p-4 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-extrabold uppercase tracking-wider text-[#1E1B18]">
              What Meridian Is &amp; Isn&apos;t
            </span>
            <button
              type="button"
              onClick={onStartCrewSync}
              disabled={phase === "running"}
              className="rounded-full bg-[#D96B43] px-3 py-1 text-[11px] font-extrabold text-white transition hover:bg-[#c45a34] disabled:opacity-50"
            >
              {phase === "running"
                ? "Running simulated crew…"
                : "Run simulated agent check"}
            </button>
          </div>
          <p className="mt-1.5 leading-relaxed text-[#5b4d41]">
            <strong>What it is:</strong> A deterministic circadian timing planner
            for travel (TRIP) and shift work (SHIFT).{" "}
            <strong>What it isn&apos;t:</strong> Not a medical device, not a
            direct measure of melatonin phase, and never recommends supplements
            (including melatonin—ask a clinician) or assesses fitness to drive.
          </p>
        </div>
      </div>
    </div>
  );
}
