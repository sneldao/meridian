import type { CalendarEvent, DayPlan, InterventionKind, Trip } from "@/domain/types";

/* The .ics builder — client-safe. Moved out of src/tools/calendar.ts (which
 * pulls in calendar-google server code) so a traveller edit can rebuild the
 * same feed the server published. tools/calendar.ts re-exports from here. */

const icsDate = (trip: Trip, dayIndex: number, min: number) => {
  const date = trip.days[dayIndex]?.date ?? trip.days[0].date;
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCMinutes(base.getUTCMinutes() + min);
  return base
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
};

/** The cues worth a lock-screen nudge — the zeitgeber gates a traveller
 *  must not sleep through. Each becomes a VEVENT with a VALARM 15 min out. */
const ALARM_CUES: [InterventionKind, string][] = [
  ["light_exposure", "☀ Light window opens"],
  ["caffeine_cutoff", "☕ Caffeine curfew"],
  ["sleep_window", "🌙 Wind-down begins"],
  ["avoid_light", "🌙 Dim lights — protect DLMO"],
];

export function buildIcs(events: CalendarEvent[], trip: Trip, days?: DayPlan[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meridian//Shift Plan//EN",
    // Branded feed name — the subscription is legible when a calendar is
    // screenshotted or shared, and the moved events below carry the link.
    `X-WR-CALNAME:Meridian shift plan — ${trip.origin.code} → ${trip.destination.code}`,
  ];
  for (const e of events) {
    const day = e.movedTo?.dayIndex ?? e.dayIndex;
    const start = e.movedTo?.startMin ?? e.startMin;
    const end = e.movedTo?.endMin ?? e.endMin;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@meridian`,
      `DTSTAMP:${icsDate(trip, 0, 0)}`,
      `DTSTART:${icsDate(trip, day, start)}`,
      `DTEND:${icsDate(trip, day, end)}`,
      `SUMMARY:${e.title}${e.movedTo ? " (rescheduled by Meridian)" : ""}`,
      // A moved event reaches every attendee's calendar — the ambient ad.
      ...(e.movedTo
        ? [`DESCRIPTION:Rescheduled by Meridian for the ${trip.destination.name} shift — meridian.trustfall.xyz`]
        : []),
      "END:VEVENT",
    );
  }
  // Plan cues with alarms — what puts Meridian on the lock screen. Times are
  // the plan's local minutes, same as the calendar events above.
  for (const d of days ?? []) {
    for (const iv of d.interventions) {
      const cue = ALARM_CUES.find(([k]) => k === iv.kind);
      if (!cue) continue;
      lines.push(
        "BEGIN:VEVENT",
        `UID:cue-${d.dayIndex}-${iv.kind}-${iv.startMin}@meridian`,
        `DTSTAMP:${icsDate(trip, 0, 0)}`,
        `DTSTART:${icsDate(trip, d.dayIndex, iv.startMin)}`,
        `DTEND:${icsDate(trip, d.dayIndex, iv.endMin ?? iv.startMin + 30)}`,
        `SUMMARY:${cue[1]}`,
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER:-PT15M",
        `DESCRIPTION:${cue[1]}`,
        "END:VALARM",
        "END:VEVENT",
      );
    }
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

