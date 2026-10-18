import type { DayPlan, Trip } from "@/domain/types";
import { INTERVENTION_LABELS } from "@/lib/intervention-icons";

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
}

/** All reminder-worthy steps in the next `horizonMs`, as absolute times —
 *  same zone math as src/lib/assistant.ts. */
export function upcomingReminders(
  trip: Trip,
  days: DayPlan[],
  now: Date,
  horizonMs = 24 * 3600 * 1000,
): ScheduledReminder[] {
  const nowMs = now.getTime();
  const out: ScheduledReminder[] = [];
  for (const day of days) {
    const spec = trip.days.find((d) => d.dayIndex === day.dayIndex);
    if (!spec?.date) continue;
    const zone =
      day.dayIndex <= trip.departureDayIndex
        ? trip.origin.utcOffsetMin
        : trip.destination.utcOffsetMin;
    const midnight = Date.parse(`${spec.date}T00:00:00Z`);
    for (const iv of day.interventions) {
      const category =
        KIND_TO_CATEGORY[iv.kind as keyof typeof KIND_TO_CATEGORY];
      if (!category) continue;
      const at = midnight + (iv.startMin - zone) * 60000;
      if (at <= nowMs || at > nowMs + horizonMs) continue;
      out.push({
        id: `${day.label}-${category}`,
        at,
        title: INTERVENTION_LABELS[iv.kind],
        body: iv.note,
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
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
            actions: [
              { action: "done", title: "Done" },
              { action: "skip", title: "Skip" },
            ],
            data: { id: r.id },
          } as NotificationOptions),
        )
        .catch(() => {});
    }, Math.max(r.at - Date.now(), 0)),
  );
  return () => timers.forEach(clearTimeout);
}
