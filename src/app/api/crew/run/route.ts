import { NextRequest } from "next/server";
import { applyFlightChoice, buildTrip, horizonFor, isKnownCity, resolveBaselineState, type WakeBand } from "@/domain/fixtures";
import { flightWindowFor } from "@/domain/nudges";
import { fetchCalendar } from "@/tools/calendar";
import { runCrew } from "@/agents/runtime";
import { rateLimit, tooMany, RL_RUNS } from "@/lib/rateLimit";
import { tenantOf } from "@/lib/tenant";
import { parseTasteFavorites } from "@/domain/taste";
import {
  appendCrewEvent,
  crewRun,
  eventsAfter,
  finishCrewRun,
  startCrewRun,
  subscribeCrewRun,
  cancelCrewRun,
} from "@/lib/crew-runs";
import { cancelCalendarApprovalsForRun } from "@/lib/calendar-approvals";
import type { CheckIn, CrewEvent } from "@/domain/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isValidDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

function expiredRunResponse(): Response {
  const events = [
    { type: "error", message: "That crew run is no longer available — start a new plan.", recoverable: true },
    { type: "done" },
  ];
  return new Response(
    events.map((e, i) => `id: ${i + 1}
data: ${JSON.stringify(e)}

`).join(""),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
      },
    },
  );
}

function sseResponse(runId: string, afterSeq: number, signal: AbortSignal) {
  const encoder = new TextEncoder();
  let closed = false;
  let last = afterSeq;
  const stream = new ReadableStream({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        controller.close();
      };
      const send = (stamped: { seq: number; runId: string; event: CrewEvent }) => {
        if (closed || stamped.seq <= last) return;
        last = stamped.seq;
        try {
          controller.enqueue(
            encoder.encode(`id: ${stamped.seq}\ndata: ${JSON.stringify(stamped.event)}\n\n`),
          );
        } catch {
          close();
          return;
        }
        if (stamped.event.type === "done") close();
      };
      const unsubscribe = subscribeCrewRun(runId, send);
      for (const event of eventsAfter(runId, afterSeq)) send(event);
      if (crewRun(runId)?.done) close();
      signal.addEventListener("abort", close, { once: true });
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

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const requestedRunId = sp.get("runId");
  const lastEventId = Number(req.headers.get("last-event-id") ?? sp.get("after") ?? 0);
  const existingRun = requestedRunId ? crewRun(requestedRunId) : undefined;

  if (existingRun) {
    return sseResponse(requestedRunId!, Number.isFinite(lastEventId) ? lastEventId : 0, req.signal);
  }
  if (requestedRunId && req.headers.has("last-event-id")) return expiredRunResponse();
  if (requestedRunId && (sp.get("resume") === "1" || sp.has("after"))) {
    return Response.json({ error: "run not found or expired" }, { status: 404 });
  }

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

  const tasteFavorites = parseTasteFavorites(sp.get("taste"));
  if (tasteFavorites === null) {
    return new Response(JSON.stringify({ error: "invalid taste favorites" }), { status: 400 });
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
  const { baseline, kind: baselineKind } = resolveBaselineState(
    wake === "before6" || wake === "6to8" || wake === "after8" ? (wake as WakeBand) : null,
  );
  const fetched = await fetchCalendar(trip);
  // The flight picker's choice plans around the real departure window.
  const flightWindow = flightWindowFor(trip, sp.get("flight"));
  const calendar = flightWindow ? applyFlightChoice(fetched.events, flightWindow.departMin) : fetched.events;
  const calendarSource = fetched.source;

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

  const runId = requestedRunId && /^[\w:-]{8,80}$/.test(requestedRunId)
    ? requestedRunId
    : crypto.randomUUID();
  const { signal } = startCrewRun(runId);
  const tenant = tenantOf(req);
  void (async () => {
    try {
      for await (const event of runCrew({
        trip,
        calendar,
        calendarSource,
        baseline,
        baselineKind,
        checkIns,
        startDayIndex,
        tenant,
        tasteFavorites,
        runId,
        signal,
      })) {
        appendCrewEvent(
          runId,
          event.type === "run_start" && !event.runId ? { ...event, runId } : event,
        );
      }
    } catch (err) {
      appendCrewEvent(runId, {
        type: "error",
        message: signal.aborted
          ? "Run cancelled — no further crew actions will run."
          : err instanceof Error
            ? err.message
            : "unknown error",
        recoverable: !signal.aborted,
      });
      appendCrewEvent(runId, { type: "done" });
    } finally {
      finishCrewRun(runId);
    }
  })();

  return sseResponse(runId, 0, req.signal);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { runId?: string } | null;
  if (!body?.runId || !crewRun(body.runId)) {
    return Response.json({ ok: false, error: "run not found" }, { status: 404 });
  }
  const ok = cancelCrewRun(body.runId);
  cancelCalendarApprovalsForRun(body.runId);
  return Response.json({ ok });
}
