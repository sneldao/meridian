"use client";

import { useMemo } from "react";
import { fmtMin } from "@/domain/circadian";
import type { EpistemicTag } from "@/domain/evidence";
import { computeTripTrajectory } from "@/domain/misalignment";
import { skippedClockDays } from "@/domain/marks";
import { dayPlace } from "@/domain/today";
import { friendlyDayLabel } from "@/lib/day-label";
import type { ActionMark } from "@/lib/trip-actions";
import type {
  CalendarEvent,
  DayPlan,
  Trip,
  WearableBaseline,
} from "@/domain/types";
import { CircadianDial, type DialCommitmentNotch, type DialMark } from "./CircadianDial";

export interface BodyClockDetailsProps {
  trip: Trip;
  locked: Map<string, DayPlan>;
  baseline: WearableBaseline;
  calendarEvents: CalendarEvent[];
  selectedDayLabel: string;

  marks: ActionMark[];
  baselineProvenance: "garmin" | "self-reported" | "demo" | "unknown";

  open?: boolean;
}

const PROVENANCE: Record<BodyClockDetailsProps["baselineProvenance"], EpistemicTag> = {
  garmin: "Measured",
  "self-reported": "You told us",
  demo: "Unknown",
  unknown: "Unknown",
};

export function BodyClockDetails({
  trip,
  locked,
  baseline,
  calendarEvents,
  selectedDayLabel,
  marks,
  baselineProvenance,
  open,
}: BodyClockDetailsProps) {
  const plans: DayPlan[] = useMemo(() => {
    const out: DayPlan[] = [];
    for (const spec of trip.days) {
      const p = locked.get(spec.label);
      if (p) out.push(p);
    }
    return out;
  }, [trip, locked]);

  const traj = useMemo(
    () =>
      computeTripTrajectory({
        trip,
        days: plans,
        baseline,
        calendar: calendarEvents,
        skippedDayIndices: skippedClockDays(marks),
      }),
    [trip, plans, baseline, calendarEvents, marks],
  );

  const spec = trip.days.find((d) => d.label === selectedDayLabel) ?? trip.days[0];
  const point = traj.find((t) => t.dayIndex === spec?.dayIndex) ?? traj[0];
  if (!spec || !point) return null;

  const plan = locked.get(spec.label);
  const place = dayPlace(trip, spec.dayIndex);
  const dayName = friendlyDayLabel(spec, trip.departureDayIndex);

  const commitments: DialCommitmentNotch[] = calendarEvents
    .filter((e) => (e.movedTo?.dayIndex ?? e.dayIndex) === point.dayIndex)
    .map((e) => ({
      id: e.id,
      title: e.title,
      startMin: e.movedTo?.startMin ?? e.startMin,
      endMin: e.movedTo?.endMin ?? e.endMin,
      fixed: !e.movable,
    }));

  const dialMarks: DialMark[] = (plan?.interventions ?? [])
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

  const sleepIv = plan?.interventions.find((iv) => iv.kind === "sleep_window");

  return (
    <details className="clock-details rise" open={open} style={{ animationDelay: ".45s" }}>
      <summary className="clock-details-summary">How my body clock is adjusting</summary>
      <div className="clock-details-body">
        <p className="clock-details-text">
          On {dayName} — {place.city} local time — your body clock is about{" "}
          {Math.abs(point.misalignmentHours).toFixed(1)}h off {trip.destination.name} time
          {point.baselineMisalignmentHours !== point.misalignmentHours
            ? ` (vs ${Math.abs(point.baselineMisalignmentHours).toFixed(1)}h with no plan)`
            : ""}
          . The plan asks you to sleep {fmtMin(point.planBedMin)}–{fmtMin(point.planWakeMin)}{" "}
          {place.city} local time, aiming at {fmtMin(point.targetBedMin)}–
          {fmtMin(point.targetWakeMin)}.
        </p>
        <CircadianDial
          dayLabel={dayName}
          mode="TRIP"
          plannedSleep={{
            startMin: sleepIv?.startMin ?? point.planBedMin,
            endMin: sleepIv?.endMin ?? point.planWakeMin,
          }}
          targetNight={{ startMin: point.targetBedMin, endMin: point.targetWakeMin }}
          usualSleep={{ startMin: baseline.avgBedtimeMin, endMin: baseline.avgWakeMin }}
          estimatedBody={{ startMin: point.bodyBedMin, endMin: point.bodyWakeMin }}
          uncertaintyHalfWidthMin={point.uncertaintyHalfWidthMin}
          misalignmentHours={point.misalignmentHours}
          misalignmentLowHours={point.misalignmentLowHours}
          misalignmentHighHours={point.misalignmentHighHours}
          baselineMisalignmentHours={point.baselineMisalignmentHours}
          commitments={commitments}
          marks={dialMarks}
          epistemicTag={PROVENANCE[baselineProvenance]}
          tone="gentle"
          onChangeTone={() => {}}
          showToneControls={false}
          skippedToday={false}
          onRepairSkip={() => {}}
        />
      </div>
    </details>
  );
}
