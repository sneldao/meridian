import { NextRequest, NextResponse } from "next/server";
import { ADHERENCE_PROFILE, GARMIN_BASELINE, buildTrip, isKnownCity } from "@/domain/fixtures";
import { fetchCalendar } from "@/tools/calendar";
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

  const trip = buildTrip(originRaw, destRaw, date);
  const cal = await fetchCalendar(trip);
  return NextResponse.json({
    trip,
    baseline: GARMIN_BASELINE,
    baselineSource: "fixture" as const,
    adherence: ADHERENCE_PROFILE,
    calendar: cal.events,
    calendarSource: cal.source,
    provider: providerKind(),
  });
}