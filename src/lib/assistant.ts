import type { DayPlan, Trip } from "@/domain/types";
import { INTERVENTION_LABELS } from "@/lib/intervention-icons";
import { timedInterventions } from "@/lib/plan-schedule";

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
  const nowMs = now.getTime();
  let best: { startMs: number; step: Omit<AssistantStep, "speech">; zone: number } | null = null;

  for (const t of timedInterventions(feed.trip, feed.days)) {
    if (t.endMs <= nowMs) continue;
    if (best && t.startMs >= best.startMs) continue;
    best = {
      startMs: t.startMs,
      zone: t.zone,
      step: {
        kind: t.iv.kind,
        label: INTERVENTION_LABELS[t.iv.kind] ?? t.iv.kind.replace(/_/g, " "),
        startMin: t.iv.startMin,
        endMin: t.iv.endMin,
        dayIndex: t.day.dayIndex,
        date: t.date,
        city: t.city,
        note: t.iv.note,
      },
    };
  }
  if (!best) return null;

  // Relative-day wording judged in the step's own zone.
  const localNow = new Date(nowMs + best.zone * 60000);
  const localStep = new Date(best.startMs + best.zone * 60000);
  const dayDiff =
    Math.floor(Date.UTC(localStep.getUTCFullYear(), localStep.getUTCMonth(), localStep.getUTCDate()) / 86400000) -
    Math.floor(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) / 86400000);
  const when =
    dayDiff === 0 ? "today" : dayDiff === 1 ? "tomorrow" : `on ${WEEKDAYS[localStep.getUTCDay()]}`;
  const speech = `Your next step is ${best.step.label} at ${hhmm(best.step.startMin)} ${best.step.city} time ${when}. ${best.step.note}`;
  return { ...best.step, speech };
}
