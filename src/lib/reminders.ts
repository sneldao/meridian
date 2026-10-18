import type { DayPlan, Trip } from "@/domain/types";
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
