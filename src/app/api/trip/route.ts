import { NextRequest, NextResponse } from "next/server";
import { ADHERENCE_PROFILE, CITY_TABLE, DEMO_TRIP, GARMIN_BASELINE, buildTrip } from "@/domain/fixtures";
import { buildCalendar } from "@/tools/calendar";
import { providerKind } from "@/agents/providers";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({ error: "invalid origin/dest" }, { status: 400 });
  }
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  const trip = buildTrip(originRaw, destRaw, date);
  return NextResponse.json({
    trip,
    baseline: GARMIN_BASELINE,
    adherence: ADHERENCE_PROFILE,
    calendar: buildCalendar(trip),
    provider: providerKind(),
  });
}