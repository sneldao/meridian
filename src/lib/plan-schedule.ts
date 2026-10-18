import type { DayPlan, Intervention, Trip } from "@/domain/types";

/** One plan intervention, resolved to absolute time. Pre-flight days are
 *  judged in the origin's zone, flight-and-after days in the destination's —
 *  a "sleep at 22:00" ask means 22:00 where the traveller actually is that
 *  night. Shared by the assistant's next-step read and the reminder
 *  scheduler so they can never disagree about when a step happens. */
export interface TimedIntervention {
  day: DayPlan;
  iv: Intervention;
  /** Local calendar date of the plan day (YYYY-MM-DD). */
  date: string;
  /** UTC offset (minutes) of the zone the step happens in. */
  zone: number;
  city: string;
  /** Epoch ms of the step's start. */
  startMs: number;
  /** Epoch ms of the step's end — wraps +24h when endMin < startMin
   *  (a 23:00–05:00 sleep window ends tomorrow). */
  endMs: number;
}

export function timedInterventions(trip: Trip, days: DayPlan[]): TimedIntervention[] {
  const out: TimedIntervention[] = [];
  for (const day of days) {
    const spec = trip.days.find((d) => d.dayIndex === day.dayIndex);
    if (!spec?.date) continue;
    const preFlight = day.dayIndex <= trip.departureDayIndex;
    const zone = preFlight ? trip.origin.utcOffsetMin : trip.destination.utcOffsetMin;
    const city = preFlight ? trip.origin.name : trip.destination.name;
    const midnight = Date.parse(`${spec.date}T00:00:00Z`);
    for (const iv of day.interventions) {
      const startMs = midnight + (iv.startMin - zone) * 60000;
      const endRaw = iv.endMin ?? iv.startMin;
      const endMs =
        midnight + (endRaw - zone) * 60000 + (endRaw < iv.startMin ? 86400000 : 0);
      out.push({ day, iv, date: spec.date, zone, city, startMs, endMs });
    }
  }
  return out;
}
