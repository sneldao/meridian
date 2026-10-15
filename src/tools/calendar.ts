import { fmtMin } from "@/domain/circadian";
import { CALENDAR } from "@/domain/fixtures";
import type { CalendarEvent, CalendarMove } from "@/domain/types";

// Fixture-backed calendar. In production this is Google Calendar; for the
// demo the "real output" is the committed move set + a downloadable .ics.

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

export function getCalendar(): CalendarEvent[] {
  return CALENDAR.map((e) => ({ ...e }));
}

export function proposeMove(
  events: CalendarEvent[],
  eventId: string,
  toDayIndex: number,
  toStartMin: number,
): { ok: true; move: CalendarMove } | { ok: false; reason: string } {
  const ev = events.find((e) => e.id === eventId);
  if (!ev) return { ok: false, reason: `no event ${eventId}` };
  if (!ev.movable) return { ok: false, reason: `"${ev.title}" is a fixed commitment` };
  const dur = ev.endMin - ev.startMin;
  const toEndMin = toStartMin + dur;
  const clash = events.find(
    (e) =>
      e.id !== eventId &&
      e.dayIndex === toDayIndex &&
      !e.movedTo &&
      overlaps(toStartMin, toEndMin, e.startMin, e.endMin),
  );
  if (clash) {
    return { ok: false, reason: `overlaps "${clash.title}" (${fmtMin(clash.startMin)}–${fmtMin(clash.endMin)})` };
  }
  const move: CalendarMove = {
    eventId,
    title: ev.title,
    from: { dayIndex: ev.dayIndex, startMin: ev.startMin, endMin: ev.endMin },
    to: { dayIndex: toDayIndex, startMin: toStartMin, endMin: toEndMin },
    reason: "",
  };
  ev.movedTo = { dayIndex: toDayIndex, startMin: toStartMin, endMin: toEndMin };
  return { ok: true, move };
}

const icsDate = (dayIndex: number, min: number) => {
  const base = new Date(Date.UTC(2026, 9, 15)); // fixtures start 2026-10-15
  base.setUTCDate(base.getUTCDate() + dayIndex);
  base.setUTCMinutes(base.getUTCMinutes() + min);
  return base
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
};

export function buildIcs(events: CalendarEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meridian//Shift Plan//EN",
  ];
  for (const e of events) {
    const day = e.movedTo?.dayIndex ?? e.dayIndex;
    const start = e.movedTo?.startMin ?? e.startMin;
    const end = e.movedTo?.endMin ?? e.endMin;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@meridian`,
      `DTSTAMP:${icsDate(0, 0)}`,
      `DTSTART:${icsDate(day, start)}`,
      `DTEND:${icsDate(day, end)}`,
      `SUMMARY:${e.title}${e.movedTo ? " (rescheduled by Meridian)" : ""}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
