import { fmtMin } from "@/domain/circadian";
import { CALENDAR, calendarFor, neutralCalendarFor } from "@/domain/fixtures";
import type { CalendarEvent, CalendarMove, Trip } from "@/domain/types";
import { fetchGoogleCalendar, googleCalendarEnabled } from "./calendar-google";

// Fixture-backed calendar by default; real Google Calendar via Composio when
// COMPOSIO_API_KEY + COMPOSIO_USER_ID are set. The "real output" is the
// committed move set — a downloadable .ics either way, patched real events
// when the Google backend is live.

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

export function getCalendar(): CalendarEvent[] {
  return CALENDAR.map((e) => ({ ...e }));
}

/** Calendar for a run: real Google events when configured, fixtures
 * otherwise — and on any Google failure (auth, network, quota). */
export async function fetchCalendar(trip: Trip): Promise<{ events: CalendarEvent[]; source: "google" | "fixture" }> {
  if (googleCalendarEnabled()) {
    try {
      const events = await fetchGoogleCalendar(trip);
      return { events, source: "google" };
    } catch {
      // fixture fallback — the show goes on
    }
  }
  return { events: buildCalendar(trip), source: "fixture" };
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

export { buildIcs } from "@/lib/ics";

export function buildCalendar(trip: Trip): CalendarEvent[] {
  // The canonical demo route keeps Alex's fixture (tests, replay, the
  // recorded demo all depend on it). Any other route gets the neutral
  // traveller calendar — generic commitments, never Alex's names.
  const isDemoRoute = trip.origin.code === "LHR" && trip.destination.code === "HND";
  return isDemoRoute ? calendarFor(trip) : neutralCalendarFor(trip);
}
