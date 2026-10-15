import { NextRequest, NextResponse } from "next/server";
import { ADHERENCE_PROFILE, CITY_TABLE, DEMO_TRIP, GARMIN_BASELINE, buildTrip } from "@/domain/fixtures";
import { buildCalendar } from "@/tools/calendar";
import { providerKind } from "@/agents/providers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const origin = (sp.get("origin") ?? "LHR") as keyof typeof CITY_TABLE;
  const dest = (sp.get("dest") ?? "HND") as keyof typeof CITY_TABLE;
  const date = sp.get("date") ?? "2026-10-18";
  const trip = CITY_TABLE[origin] && CITY_TABLE[dest] ? buildTrip(origin, dest, date) : DEMO_TRIP;
  return NextResponse.json({
    trip,
    baseline: GARMIN_BASELINE,
    adherence: ADHERENCE_PROFILE,
    calendar: buildCalendar(trip),
    provider: providerKind(),
  });
}