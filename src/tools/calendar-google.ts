import type { CalendarEvent, CalendarMove, DayPlan, Trip } from "@/domain/types";

// Real-calendar backend via Composio's MCP endpoint (connect.composio.dev/mcp).
// The consumer key is already bound to the connected Google account — no
// project API key or entity id needed. Force off with CALENDAR_BACKEND=fixture.
// The crew works in dayIndex/startMin space — this module is the only place
// that maps that onto RFC3339 wall time.

const MCP_URL = "https://connect.composio.dev/mcp";
const TZ = () => process.env.MERIDIAN_CALENDAR_TZ ?? "Europe/London";
const CALENDAR_ID = () => process.env.GOOGLE_CALENDAR_ID ?? "primary";

let reqId = 0;

export function googleCalendarEnabled(): boolean {
  if (process.env.CALENDAR_BACKEND === "fixture") return false;
  return Boolean(process.env.COMPOSIO_API_KEY);
}

/** Executes one Composio tool through the MCP JSON-RPC endpoint and unwraps
 * the nested payload: result.content[0].text → data.results[0].response.data */
async function exec(slug: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "x-consumer-api-key": process.env.COMPOSIO_API_KEY!,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++reqId,
      method: "tools/call",
      params: {
        name: "COMPOSIO_MULTI_EXECUTE_TOOL",
        arguments: { memory: {}, tools: [{ tool_slug: slug, arguments: args }] },
      },
    }),
  });
  if (!res.ok) throw new Error(`composio mcp ${res.status}`);

  const raw = await res.text();
  const dataLine = raw.split("\n").find((l) => l.startsWith("data:"));
  if (!dataLine) throw new Error("composio mcp: no data frame");
  const rpc = JSON.parse(dataLine.slice(5));
  const text = rpc?.result?.content?.[0]?.text;
  if (rpc?.isError || !text) {
    throw new Error(rpc?.error?.message ?? "composio mcp: empty result");
  }
  const payload = JSON.parse(text);
  const first = payload?.data?.results?.[0]?.response;
  if (!first?.successful) {
    throw new Error(first?.error ?? payload?.error?.message ?? `${slug} failed`);
  }
  return (first.data ?? {}) as Record<string, unknown>;
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
    timeMin: `${first}T00:00:00`,
    timeMax: `${last}T23:59:59`,
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
      await exec("GOOGLECALENDAR_CREATE_EVENT", {
        calendar_id: CALENDAR_ID(),
        summary: `Meridian — ${iv.kind.replace(/_/g, " ")}`,
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
