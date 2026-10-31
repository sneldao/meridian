import type { DayPlan, Trip } from "@/domain/types";
import { cityOn } from "@/domain/airports";
import { INTERVENTION_LABELS } from "@/lib/intervention-icons";
import { timedInterventions } from "@/lib/plan-schedule";

/** Which intervention kinds earn a nudge, and the nudge-id suffix each maps to
 *  (must stay aligned with `buildDailyNudgesForDay` in src/domain/nudges.ts). */
const KIND_TO_CATEGORY = {
  light_exposure: "sunlight",
  exercise: "run",
  caffeine_cutoff: "nutrition",
  sleep_window: "sleep",
} as const;

export interface ScheduledReminder {
  id: string;
  at: number;
  title: string;
  body: string;
  /** Tap-through deep link — outcome knocks carry one; plan steps don't. */
  url?: string;
  /** Push TTL in seconds. Steps default to the pipeline's short 300s; a
   *  morning knock wants hours, since the traveller's phone may be asleep. */
  ttlSec?: number;
}

/** All reminder-worthy steps in the next `horizonMs`, as absolute times —
 *  same clock as src/lib/assistant.ts via src/lib/plan-schedule.ts. */
export function upcomingReminders(
  trip: Trip,
  days: DayPlan[],
  now: Date,
  horizonMs = 24 * 3600 * 1000,
): ScheduledReminder[] {
  const nowMs = now.getTime();
  return timedInterventions(trip, days)
    .filter((t) => {
      const category = KIND_TO_CATEGORY[t.iv.kind as keyof typeof KIND_TO_CATEGORY];
      return category !== undefined && t.startMs > nowMs && t.startMs <= nowMs + horizonMs;
    })
    .map((t) => ({
      id: `${t.day.label}-${KIND_TO_CATEGORY[t.iv.kind as keyof typeof KIND_TO_CATEGORY]}`,
      at: t.startMs,
      title: INTERVENTION_LABELS[t.iv.kind],
      body: t.iv.note,
    }))
    .sort((a, b) => a.at - b.at);
}

/** setTimeout-based scheduling — reminders fire while Meridian stays open.
 *  Returns a cleanup that cancels everything. */
export function scheduleReminders(reminders: ScheduledReminder[]): () => void {
  const timers = reminders.map((r) =>
    setTimeout(() => {
      void navigator.serviceWorker?.ready
        .then((reg) =>
          reg.showNotification(r.title, {
            body: r.body,
            tag: r.id,
            // Tap-through reminders carry their link and no Done/Skip —
            // the answer lives on the page the tap opens.
            ...(r.url
              ? {}
              : {
                  actions: [
                    { action: "done", title: "Done" },
                    { action: "skip", title: "Skip" },
                  ],
                }),
            data: { id: r.id, url: r.url },
          } as NotificationOptions),
        )
        .catch(() => {});
    }, Math.max(r.at - Date.now(), 0)),
  );
  return () => timers.forEach(clearTimeout);
}

/** Add calendar days to an ISO date without leaving the calendar (no local
 *  time zone ever touches the arithmetic). */
export function isoAddDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The last planned day's date — DayPlan carries none, so it is read off the
 *  trip's specs for the days the crew actually locked. */
function lastPlannedDate(trip: Trip, days: DayPlan[]): string | null {
  let last: string | null = null;
  for (const day of days) {
    const spec = trip.days.find((d) => d.dayIndex === day.dayIndex);
    if (spec?.date && (!last || spec.date > last)) last = spec.date;
  }
  return last;
}

/** The morning-after knock (round 17 · push pairing): at 08:00 destination
 *  time on the morning after the last planned day, one push asks how the
 *  traveller actually slept and taps through to /outcome. The id is stable
 *  per trip, so the dispatch's sent-map delivers it exactly once; the
 *  12-hour TTL survives a phone that was asleep at eight. The offset is
 *  resolved for *that* date (cityOn), so a trip spanning a DST change still
 *  knocks at a real local 08:00. */
export function outcomeReminder(
  trip: Trip,
  days: DayPlan[],
  now: Date,
  horizonMs: number,
): ScheduledReminder | null {
  const lastDate = lastPlannedDate(trip, days);
  if (!lastDate) return null;
  const nextDate = isoAddDays(lastDate, 1);
  const zone = cityOn(trip.destination.code, nextDate).utcOffsetMin;
  const at = Date.parse(`${nextDate}T00:00:00Z`) + (8 * 60 - zone) * 60000;
  const nowMs = now.getTime();
  if (at <= nowMs || at > nowMs + horizonMs) return null;
  return {
    id: `outcome-${trip.destination.code}-${lastDate}`,
    at,
    title: "How did you actually sleep?",
    body: "Rate the trip while it's fresh — sixty seconds, no scales.",
    url: `/outcome?origin=${trip.origin.code}&dest=${trip.destination.code}&date=${lastDate}`,
    ttlSec: 12 * 3600,
  };
}

/** Everything a dispatch tick should consider: the timed plan steps plus the
 *  outcome knock, sorted by when they fire. */
export function dueReminders(
  trip: Trip,
  days: DayPlan[],
  now: Date,
  horizonMs: number,
): ScheduledReminder[] {
  const out = upcomingReminders(trip, days, now, horizonMs);
  const knock = outcomeReminder(trip, days, now, horizonMs);
  if (knock) out.push(knock);
  return out.sort((a, b) => a.at - b.at);
}
