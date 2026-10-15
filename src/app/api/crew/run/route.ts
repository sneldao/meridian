import { NextRequest } from "next/server";
import { CITY_TABLE, DEMO_TRIP, buildTrip } from "@/domain/fixtures";
import { buildCalendar } from "@/tools/calendar";
import { runCrew } from "@/agents/runtime";
import type { CheckIn } from "@/domain/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isCityCode(v: string): v is keyof typeof CITY_TABLE {
  return Object.prototype.hasOwnProperty.call(CITY_TABLE, v);
}

function isValidDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const originRaw = sp.get("origin") ?? "LHR";
  const destRaw = sp.get("dest") ?? "HND";
  const date = sp.get("date") ?? "2026-10-18";

  if (!isCityCode(originRaw) || !isCityCode(destRaw)) {
    return new Response(JSON.stringify({ error: "invalid origin/dest" }), { status: 400 });
  }
  if (!isValidDate(date)) {
    return new Response(JSON.stringify({ error: "invalid date" }), { status: 400 });
  }

  const startDayRaw = sp.get("startDay");
  const startDayIndex = startDayRaw === null ? 0 : Number(startDayRaw);
  if (!Number.isInteger(startDayIndex) || startDayIndex < 0 || startDayIndex > 4) {
    return new Response(JSON.stringify({ error: "invalid startDay" }), { status: 400 });
  }

  const trip = buildTrip(originRaw, destRaw, date);
  const calendar = buildCalendar(trip);

  let checkIns: CheckIn[] = [];
  const rawCI = sp.get("checkins");
  if (rawCI) {
    try {
      const decoded = Buffer.from(rawCI, "base64").toString("utf8");
      const parsed = JSON.parse(decoded);
      if (!Array.isArray(parsed)) throw new Error("checkins must be an array");
      checkIns = parsed as CheckIn[];
    } catch {
      return new Response(JSON.stringify({ error: "invalid checkins" }), { status: 400 });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runCrew({ trip, calendar, checkIns, startDayIndex })) {
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