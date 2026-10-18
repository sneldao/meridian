import type { DayPlan, Trip } from "@/domain/types";
import { INTERVENTION_LABELS } from "@/lib/intervention-icons";

export interface AssistantStep {
  kind: string;
  label: string;
  startMin: number;
  endMin: number | undefined;
  dayIndex: number;
  date: string;
  city: string;
  note: string;
  speech: string;
}

const WEEKDAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function hhmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** The earliest plan step whose window hasn't ended yet — judged against the
 *  zone the step happens in (home before the flight, destination after). */
export function nextStepFromPlan(
  feed: { trip: Trip; days: DayPlan[] },
  now: Date,
): AssistantStep | null {
  const { trip, days } = feed;
  const nowMs = now.getTime();
  let best: { start: number; step: Omit<AssistantStep, "speech"> } | null = null;

  for (const day of days) {
    const spec = trip.days.find((d) => d.dayIndex === day.dayIndex);
    if (!spec?.date) continue;
    const zone =
      day.dayIndex <= trip.departureDayIndex
        ? trip.origin.utcOffsetMin
        : trip.destination.utcOffsetMin;
    const city =
      day.dayIndex <= trip.departureDayIndex
        ? trip.origin.name
        : trip.destination.name;
    const midnight = Date.parse(`${spec.date}T00:00:00Z`);
    for (const iv of day.interventions) {
      const start = midnight + (iv.startMin - zone) * 60000;
      const endRaw = iv.endMin ?? iv.startMin;
      const end = midnight + (endRaw - zone) * 60000 + (endRaw < iv.startMin ? 86400000 : 0);
      if (end <= nowMs) continue;
      if (!best || start < best.start) {
        best = {
          start,
          step: {
            kind: iv.kind,
            label: INTERVENTION_LABELS[iv.kind] ?? iv.kind.replace(/_/g, " "),
            startMin: iv.startMin,
            endMin: iv.endMin,
            dayIndex: day.dayIndex,
            date: spec.date,
            city,
            note: iv.note,
          },
        };
      }
    }
  }
  if (!best) return null;

  // Relative-day wording judged in the step's own zone.
  const stepZone =
    best.step.dayIndex <= trip.departureDayIndex
      ? trip.origin.utcOffsetMin
      : trip.destination.utcOffsetMin;
  const localNow = new Date(nowMs + stepZone * 60000);
  const localStep = new Date(best.start + stepZone * 60000);
  const dayDiff =
    Math.floor(Date.UTC(localStep.getUTCFullYear(), localStep.getUTCMonth(), localStep.getUTCDate()) / 86400000) -
    Math.floor(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) / 86400000);
  const when =
    dayDiff === 0 ? "today" : dayDiff === 1 ? "tomorrow" : `on ${WEEKDAYS[localStep.getUTCDay()]}`;
  const speech = `Your next step is ${best.step.label} at ${hhmm(best.step.startMin)} ${best.step.city} time ${when}. ${best.step.note}`;
  return { ...best.step, speech };
}
