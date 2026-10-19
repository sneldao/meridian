import { NextRequest, NextResponse } from "next/server";
import { ADHERENCE_PROFILE, GARMIN_BASELINE, applyFlightChoice, buildTrip, horizonFor, isKnownCity } from "@/domain/fixtures";
import { flightWindowFor } from "@/domain/nudges";
import { fetchCalendar } from "@/tools/calendar";
import { loadWearableBaseline } from "@/tools/wearable";
import { tenantOf } from "@/lib/tenant";
import { providerKind } from "@/agents/providers";

export const dynamic = "force-dynamic";

function isValidDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const originRaw = (sp.get("origin") ?? "LHR").toUpperCase();
  const destRaw = (sp.get("dest") ?? "HND").toUpperCase();
  const date = sp.get("date") ?? "2026-10-18";

  if (!isKnownCity(originRaw) || !isKnownCity(destRaw)) {
    return NextResponse.json({ error: "invalid origin/dest" }, { status: 400 });
  }
  if (originRaw === destRaw) {
    return NextResponse.json({ error: "origin and destination are the same" }, { status: 400 });
  }
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  const draft = buildTrip(originRaw, destRaw, date);
  const daysUntil = Math.round((new Date(date + "T00:00:00Z").getTime() - Date.now()) / 86400000);
  const trip = buildTrip(originRaw, destRaw, date, horizonFor(draft.requiredShiftMin, Math.max(0, daysUntil)));
  const cal = await fetchCalendar(trip);
  // A picked flight window moves the flight event; unknown ids (a stale
  // default or a wrong-direction option) leave the fixture slot in place.
  const flightId = sp.get("flight");
  const flightWindow = flightWindowFor(trip, flightId);
  const calendar = flightWindow ? applyFlightChoice(cal.events, flightWindow.departMin) : cal.events;
  // A traveller who uploaded a wearable export gets their own numbers back,
  // tagged as real. Everyone else gets the labelled sample profile.
  const wearable = await loadWearableBaseline(tenantOf(req));
  return NextResponse.json({
    trip,
    baseline: wearable ?? GARMIN_BASELINE,
    baselineSource: wearable ? ("garmin" as const) : ("fixture" as const),
    baselineKind: wearable ? ("garmin" as const) : ("demo-default" as const),
    adherence: ADHERENCE_PROFILE,
    calendar,
    calendarSource: cal.source,
    flightId: flightWindow ? flightId : null,
    provider: providerKind(),
  });
}