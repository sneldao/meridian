"use client";

// Dial workbench: the 24-hour dial and the daily action card, on the demo
// route, with the real solver and the real projection behind them. Not linked
// from the app — this is where the surfaces get looked at before they are
// wired into the product.

import { useMemo, useState } from "react";
import { CircadianDial, type DialCommitmentNotch, type DialMark } from "@/components/dial/CircadianDial";
import { DailyActionCard, type PlanStatus } from "@/components/dial/DailyActionCard";
import { fmtMin } from "@/domain/circadian";
import { computeTripTrajectory } from "@/domain/misalignment";
import { buildShiftWeekPlan } from "@/domain/shift-work";
import { getEvidenceForKind } from "@/domain/evidence";
import { solveDay } from "@/domain/solver";
import {
  ADHERENCE_PROFILE,
  CALENDAR,
  DEMO_TRIP,
  GARMIN_BASELINE,
} from "@/domain/fixtures";
import type { DayPlan } from "@/domain/types";
import type { MascotTone } from "@/domain/mascot";

export default function DevDial() {
  const [tone, setTone] = useState<MascotTone>("cheeky");
  const [dayIndex, setDayIndex] = useState(0);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [done, setDone] = useState(false);
  const [alcohol, setAlcohol] = useState(false);

  const days: DayPlan[] = useMemo(() => {
    const out: DayPlan[] = [];
    for (const spec of DEMO_TRIP.days) {
      const r = solveDay({
        trip: DEMO_TRIP,
        spec,
        lockedDays: out,
        calendar: CALENDAR,
        adherence: ADHERENCE_PROFILE,
        baseline: GARMIN_BASELINE,
      });
      if (r) out.push(r.plan);
    }
    return out;
  }, []);

  const traj = useMemo(
    () =>
      computeTripTrajectory({
        trip: DEMO_TRIP,
        days,
        baseline: GARMIN_BASELINE,
        calendar: CALENDAR,
        skippedDayIndices: skipped,
        alcoholDayIndices: alcohol ? new Set([dayIndex]) : new Set(),
      }),
    [days, skipped, alcohol, dayIndex],
  );

  const point = traj[dayIndex] ?? traj[0];
  const plan = days[dayIndex] ?? days[0];
  const spec = DEMO_TRIP.days[dayIndex] ?? DEMO_TRIP.days[0];

  const commitments: DialCommitmentNotch[] = CALENDAR.filter(
    (e) => e.dayIndex === point.dayIndex,
  ).map((e) => ({
    id: e.id,
    title: e.title,
    startMin: e.startMin,
    endMin: e.endMin,
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
    }));

  const lightIv = plan?.interventions.find((iv) => iv.kind === "light_exposure");
  const sleepIv = plan?.interventions.find((iv) => iv.kind === "sleep_window");
  const action = lightIv
    ? {
        id: "light",
        kind: "light_exposure" as const,
        title: "Step into bright morning light",
        timeWindow: `${fmtMin(lightIv.startMin)}–${fmtMin(lightIv.endMin ?? lightIv.startMin + 60)}`,
        startMin: lightIv.startMin,
        endMin: lightIv.endMin,
        shortReason:
          "Post-wake bright light advances your clock toward the destination's morning.",
        epistemicTag: "Recommended" as const,
        constraintNote: point.commitmentConflicts[0]?.tradeOffNote,
      }
    : {
        id: "sleep",
        kind: "sleep_window" as const,
        title: `Target sleep ${fmtMin(point.targetBedMin)} – ${fmtMin(point.targetWakeMin)}`,
        timeWindow: `${fmtMin(point.targetBedMin)} – ${fmtMin(point.targetWakeMin)}`,
        startMin: point.targetBedMin,
        endMin: point.targetWakeMin,
        shortReason:
          "The dark window is what carries the shift — everything else lands around it.",
        epistemicTag: "Recommended" as const,
      };

  const shiftWeek = buildShiftWeekPlan();

  return (
    <main className="flex min-h-screen flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono2 text-xs text-mist">dial workbench</span>
        {DEMO_TRIP.days.map((d, i) => (
          <button
            key={d.label}
            type="button"
            className="rounded-full border border-line px-3 py-1 text-xs"
            aria-pressed={i === dayIndex}
            onClick={() => setDayIndex(i)}
          >
            {d.label}
          </button>
        ))}
      </div>

      <CircadianDial
        dayLabel={spec.label}
        mode="TRIP"
        plannedSleep={{
          startMin: sleepIv?.startMin ?? point.planBedMin,
          endMin: sleepIv?.endMin ?? point.planWakeMin,
        }}
        targetNight={{ startMin: point.targetBedMin, endMin: point.targetWakeMin }}
        usualSleep={{
          startMin: GARMIN_BASELINE.avgBedtimeMin,
          endMin: GARMIN_BASELINE.avgWakeMin,
        }}
        estimatedBody={{ startMin: point.bodyBedMin, endMin: point.bodyWakeMin }}
        uncertaintyHalfWidthMin={point.uncertaintyHalfWidthMin}
        misalignmentHours={point.misalignmentHours}
        misalignmentLowHours={point.misalignmentLowHours}
        misalignmentHighHours={point.misalignmentHighHours}
        baselineMisalignmentHours={point.baselineMisalignmentHours}
        commitments={commitments}
        marks={marks}
        epistemicTag="Estimated"
        tone={tone}
        onChangeTone={setTone}
        skippedToday={skipped.has(point.dayIndex)}
        onRepairSkip={() =>
          setSkipped((prev) => {
            const next = new Set(prev);
            next.delete(point.dayIndex);
            return next;
          })
        }
      />

      <DailyActionCard
        action={action}
        status={"proposed" as PlanStatus}
        isDone={done}
        onMarkDone={() => setDone((v) => !v)}
        isSkipped={skipped.has(point.dayIndex)}
        onSkip={() =>
          setSkipped((prev) => {
            const next = new Set(prev);
            if (next.has(point.dayIndex)) next.delete(point.dayIndex);
            else next.add(point.dayIndex);
            return next;
          })
        }
        alcoholActive={alcohol}
        onToggleAlcohol={() => setAlcohol((v) => !v)}
        citations={[]}
      />

      <section className="dial">
        <h3 className="dial-title">Shift week (seed + computed clock)</h3>
        <ul className="dial-list">
          {shiftWeek.map((d) => (
            <li className="dial-list-row" key={d.label}>
              <span>
                {d.label} · {d.dayTypeBadge}
              </span>
              <span>
                {d.misalignmentHours}h owed (base {d.baselineMisalignmentHours}h)
              </span>
            </li>
          ))}
        </ul>
        <p className="dial-sub">
          Grades in play: {getEvidenceForKind("light_exposure").mechanismGrade} mechanism,{" "}
          {getEvidenceForKind("light_exposure").fieldGrade} field.
        </p>
      </section>
    </main>
  );
}
