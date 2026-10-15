import { NextResponse } from "next/server";
import { ADHERENCE_PROFILE, CALENDAR, DEMO_TRIP, GARMIN_BASELINE } from "@/domain/fixtures";
import { providerKind } from "@/agents/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    trip: DEMO_TRIP,
    baseline: GARMIN_BASELINE,
    adherence: ADHERENCE_PROFILE,
    calendar: CALENDAR,
    provider: providerKind(),
  });
}
