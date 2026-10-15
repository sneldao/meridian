import { Composio } from "@composio/core";
import type { CalendarEvent, CalendarMove, DayPlan, Trip } from "@/domain/types";

// Real-calendar backend via Composio's Google Calendar toolkit.
// Enabled when COMPOSIO_API_KEY + COMPOSIO_USER_ID are set; force off with
// CALENDAR_BACKEND=fixture. The crew works in dayIndex/startMin space — this
// module is the only place that maps that onto RFC3339 wall time.

const TZ = () => process.env.MERIDIAN_CALENDAR_TZ ?? "Europe/London";
const CALENDAR_ID = () => process.env.GOOGLE_CALENDAR_ID ?? "primary";

let client: Composio | null = null;

export function googleCalendarEnabled(): boolean {
  if (process.env.CALENDAR_BACKEND === "fixture") return false;
  return Boolean(process.env.COMPOSIO_API_KEY && process.env.COMPOSIO_USER_ID);
}

function composio(): Composio {
  client ??= new Composio({
    apiKey: process.env.COMPOSIO_API_KEY,
    toolkitVersions: {
      googlecalendar: process.env.COMPOSIO_GOOGLECALENDAR_VERSION ?? "20261010_00",
    },
  });
  return client;
}

async function exec(slug: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await composio().tools.execute(slug, {
    userId: process.env.COMPOSIO_USER_ID!,
    arguments: args,
  });
  if (!res.successful) throw new Error(res.error ?? `${slug} failed`);
  // Composio wraps Google payloads inconsistently across tool versions —
  // tolerate both `data.items` and `data.data.items`.
  const data = res.data as Record<string, unknown>;
  return (data?.data as Record<string, unknown>) ?? data ?? {};
}

const dateOf = (trip: Trip, dayIndex: number) => trip.days[dayIndex]?.date;

function toRFC3339(date: string, min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
}

interface GoogleEvent {
  id?: string;
  summary?: string;
  status?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: unknown[];
}

/** Lists the wearer's real events across the trip window, mapped into
 * CalendarEvent space. Events with attendees are walls (movable: false) —
 * the same semantics the fixtures encode by hand. */
export async function fetchGoogleCalendar(trip: Trip): Promise<CalendarEvent[]> {
  const first = trip.days[0]?.date;
  const last = trip.days[trip.days.length - 1]?.date;
  if (!first || !last) return [];

  const data = await exec("GOOGLECALENDAR_EVENTS_LIST", {
    calendarId: CALENDAR_ID(),
    timeMin: `${first}T00:00:00Z`,
    timeMax: `${last}T23:59:59Z`,
    singleEvents: true,
    orderBy: "startTime",
    timeZone: TZ(),
    maxResults: 250,
    fields: "items(id,summary,status,start,end,attendees)",
  });

  const items = (data.items as GoogleEvent[] | undefined) ?? [];
  const out: CalendarEvent[] = [];
  for (const ev of items) {
    if (ev.status === "cancelled") continue;
    const startDt = ev.start?.dateTime;
    const endDt = ev.end?.dateTime;
    if (!startDt || !endDt) continue; // all-day events don't carry wall time
    const dayIndex = trip.days.findIndex((d) => d.date === startDt.slice(0, 10));
    if (dayIndex === -1) continue;
    const toMin = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
    out.push({
      id: ev.id ?? `gcal-${out.length}`,
      title: ev.summary ?? "(busy)",
      dayIndex,
      startMin: toMin(startDt),
      endMin: Math.max(toMin(endDt), toMin(startDt) + 15),
      movable: !ev.attendees?.length, // meetings with attendees are walls
    });
  }
  return out;
}

/** Applies a proposed move to the real event. send_updates:"none" — the demo
 * should not email attendees from stage. */
export async function patchGoogleEvent(
  ev: CalendarEvent,
  move: CalendarMove,
  trip: Trip,
): Promise<void> {
  const date = dateOf(trip, move.to.dayIndex);
  if (!date) throw new Error(`no date for dayIndex ${move.to.dayIndex}`);
  await exec("GOOGLECALENDAR_PATCH_EVENT", {
    calendar_id: CALENDAR_ID(),
    event_id: ev.id,
    start_time: toRFC3339(date, move.to.startMin),
    end_time: toRFC3339(date, move.to.endMin),
    timezone: TZ(),
    send_updates: "none",
  });
}

/** Writes every locked day's interventions into the real calendar as
 * Meridian blocks. Runs once at commit; failures on individual blocks are
 * tolerated — the .ics remains the canonical artifact. */
export async function createPlanEvents(days: DayPlan[], trip: Trip): Promise<number> {
  const writes = days.flatMap((day) => {
    const date = dateOf(trip, day.dayIndex);
    if (!date) return [];
    return day.interventions.map((iv) => async () => {
      const title = `Meridian — ${iv.kind.replace(/_/g, " ")}`;
      await exec("GOOGLECALENDAR_CREATE_EVENT", {
        calendar_id: CALENDAR_ID(),
        summary: title,
        description: `${iv.note}\n\nPlanned by the Meridian night shift.`,
        start_time: toRFC3339(date, iv.startMin),
        end_time: toRFC3339(date, iv.endMin ?? iv.startMin + 30),
        timezone: TZ(),
        send_updates: "none",
      });
    });
  });
  const results = await Promise.allSettled(writes.map((w) => w()));
  return results.filter((r) => r.status === "fulfilled").length;
}
