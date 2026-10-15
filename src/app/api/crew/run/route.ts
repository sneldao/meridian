import { NextRequest } from "next/server";
import { CITY_TABLE, DEMO_TRIP, buildTrip } from "@/domain/fixtures";
import { fetchCalendar } from "@/tools/calendar";
import { runCrew } from "@/agents/runtime";
import type { CheckIn } from "@/domain/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const origin = (sp.get("origin") ?? "LHR") as keyof typeof CITY_TABLE;
  const dest = (sp.get("dest") ?? "HND") as keyof typeof CITY_TABLE;
  const date = sp.get("date") ?? "2026-10-18";
  const trip = CITY_TABLE[origin] && CITY_TABLE[dest] ? buildTrip(origin, dest, date) : DEMO_TRIP;
  const { events: calendar, source: calendarSource } = await fetchCalendar(trip);

  let checkIns: CheckIn[] = [];
  const rawCI = sp.get("checkins");
  if (rawCI) {
    try {
      checkIns = JSON.parse(Buffer.from(rawCI, "base64").toString("utf8")) as CheckIn[];
    } catch {
      checkIns = [];
    }
  }
  const startDayIndex = Number(sp.get("startDay") ?? "0") || 0;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runCrew({ trip, calendar, calendarSource, checkIns, startDayIndex })) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message, recoverable: false })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}