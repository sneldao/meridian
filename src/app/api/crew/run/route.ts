import { NextRequest } from "next/server";
import { buildTrip, horizonFor, isKnownCity, resolveBaseline, type WakeBand } from "@/domain/fixtures";
import { fetchCalendar } from "@/tools/calendar";
import { runCrew } from "@/agents/runtime";
import { rateLimit, tooMany, RL_RUNS } from "@/lib/rateLimit";
import type { CheckIn } from "@/domain/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isValidDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const originRaw = (sp.get("origin") ?? "LHR").toUpperCase();
  const destRaw = (sp.get("dest") ?? "HND").toUpperCase();
  const date = sp.get("date") ?? "2026-10-18";

  if (!isKnownCity(originRaw) || !isKnownCity(destRaw)) {
    return new Response(JSON.stringify({ error: "invalid origin/dest" }), { status: 400 });
  }
  if (originRaw === destRaw) {
    return new Response(JSON.stringify({ error: "origin and destination are the same" }), { status: 400 });
  }
  if (!isValidDate(date)) {
    return new Response(JSON.stringify({ error: "invalid date" }), { status: 400 });
  }

  const startDayRaw = sp.get("startDay");
  const startDayIndex = startDayRaw === null ? 0 : Number(startDayRaw);

  // Bounded spend: one full crew run costs real tokens — cap runs per IP.
  const rl = rateLimit(req, "crew-run", { limit: RL_RUNS, windowMs: 3_600_000 });
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const draft = buildTrip(originRaw, destRaw, date);
  const daysUntil = Math.round((new Date(date + "T00:00:00Z").getTime() - Date.now()) / 86400000);
  const trip = buildTrip(originRaw, destRaw, date, horizonFor(draft.requiredShiftMin, Math.max(0, daysUntil)));
  if (!Number.isInteger(startDayIndex) || startDayIndex < 0 || startDayIndex > trip.days.length - 1) {
    return new Response(JSON.stringify({ error: "invalid startDay" }), { status: 400 });
  }
  const wake = sp.get("wake");
  const baseline = resolveBaseline(
    wake === "before6" || wake === "6to8" || wake === "after8" ? (wake as WakeBand) : null,
  );
  const { events: calendar, source: calendarSource } = await fetchCalendar(trip);

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
        for await (const event of runCrew({ trip, calendar, calendarSource, baseline, checkIns, startDayIndex, tenant: sp.get("tenant") ?? undefined })) {
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