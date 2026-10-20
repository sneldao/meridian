"use client";

import { useMemo, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import type { EpistemicTag } from "@/domain/evidence";
import { type MascotTone } from "@/domain/mascot";
import { buildShiftWeekPlan } from "@/domain/shift-work";
import { CircadianDial, type DialCommitmentNotch, type DialMark } from "./CircadianDial";
import { DailyActionCard, type DailyAction } from "./DailyActionCard";
import { HoldToConfirm } from "./HoldToConfirm";
import { MeridianOnboarding } from "./MeridianOnboarding";
import type { OnboardingState } from "@/domain/types";

/**
 * The shift week, on its own screen.
 *
 * It was a mode inside the travel view, and that was a product smell: a
 * shift worker and a traveller are different products, and a switch between
 * them on one screen makes both of them look like the same product with a
 * different dataset. It now has its own door.
 */
export function ShiftScreen() {
  const [dayIndex, setDayIndex] = useState(0);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [selfReport, setSelfReport] = useState<{
    bedtimeMin: number;
    wakeMin: number;
    chronotype: "early" | "neutral" | "late";
  } | null>(null);
  const [wearableOptedIn, setWearableOptedIn] = useState(false);
  const [doneDays, setDoneDays] = useState<Set<number>>(new Set());
  const [tone, setTone] = useState<MascotTone>("cheeky");
  const [partnerCovers, setPartnerCovers] = useState(false);
  const [skippedDays, setSkippedDays] = useState<Set<number>>(new Set());
  const [alcoholDays, setAlcoholDays] = useState<Set<number>>(new Set());

  const week = useMemo(
    () =>
      buildShiftWeekPlan({
        partnerCoversAfternoonPickup: partnerCovers,
        skippedDayIndices: skippedDays,
        alcoholDayIndices: alcoholDays,
      }),
    [partnerCovers, skippedDays, alcoholDays],
  );
  const day = week[dayIndex] ?? week[0];
  /** The shift week is the traveller's own plan, not a sample: the inputs
   *  are their answers, so the provenance is theirs. */
  const provenance: EpistemicTag = "You told us";

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
      <div className="dial-head">
        <h3 className="dial-title">Rotating shifts</h3>
        <span className="dial-sub">
          A week of nights, days and days off, with one movable commitment in it.
        </span>
      </div>

      <div className="dial-actions">
        <button
          type="button"
          className="dial-btn"
          onClick={() => setOnboardingOpen(true)}
        >
          Set up your clock
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
        onSkip={() =>
          setSkippedDays((prev) => {
            const next = new Set(prev);
            if (next.has(day.dayIndex)) next.delete(day.dayIndex);
            else next.add(day.dayIndex);
            return next;
          })
        }
        alcoholActive={alcoholDays.has(day.dayIndex)}
        onToggleAlcohol={() =>
          setAlcoholDays((prev) => {
            const next = new Set(prev);
            if (next.has(day.dayIndex)) next.delete(day.dayIndex);
            else next.add(day.dayIndex);
            return next;
          })
        }
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
        onChangeTone={setTone}
        skippedToday={false}
        onRepairSkip={() => undefined}
        isShiftPostNightWarning={Boolean(day.postShiftSafetyWarning)}
      />

      <section className="dial" aria-label="Commitments">
        <h3 className="dial-title">This week&apos;s commitments</h3>
        <ul className="dial-list">
          {day.commitments.map((c) => (
            <li className="dial-list-row" key={c.id} style={{ alignItems: "flex-start" }}>
              <span>
                {c.title} ({c.negotiable ? "negotiable" : "fixed"})
                {/* What keeping it costs, and what moving it buys. A
                    commitment the traveller cannot move still has a price,
                    and the price should be on the screen. */}
                <span className="dial-sub" style={{ display: "block", marginTop: 2 }}>
                  {c.active ? c.tradeOffIfKept : c.tradeOffIfMoved}
                </span>
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
            onConfirm={() => setPartnerCovers(!partnerCovers)}
          />
        </div>
        <p className="dial-sub">
          Handing the pickup over buys an hour of sleep before the last night
          shift. It is a trade, so it takes a hold rather than a tap.
        </p>
      </section>

      <MeridianOnboarding
        open={onboardingOpen}
        mode="SHIFT"
        state={{
          bedtimeMin: selfReport?.bedtimeMin ?? 23 * 60,
          wakeMin: selfReport?.wakeMin ?? 7 * 60,
          chronotype: selfReport?.chronotype ?? "neutral",
          wearableOptedIn,
          tone,
          protect: [],
        }}
        onChange={(next: OnboardingState) => {
          setTone(next.tone ?? "cheeky");
          setWearableOptedIn(next.wearableOptedIn ?? false);
          setSelfReport({
            bedtimeMin: next.bedtimeMin ?? 23 * 60,
            wakeMin: next.wakeMin ?? 7 * 60,
            chronotype: next.chronotype ?? "neutral",
          });
        }}
        onClose={() => setOnboardingOpen(false)}
        onComplete={() => setOnboardingOpen(false)}
        commitments={day.commitments.map((c) => ({
          id: c.id,
          title: c.title,
          startMin: c.startMin,
          endMin: c.endMin,
          movable: c.negotiable,
        }))}
      />
    </div>
  );
}
