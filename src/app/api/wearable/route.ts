import { NextResponse } from "next/server";
import { baselineFromNights, parseGarminSleepCsv, saveWearableBaseline } from "@/tools/wearable";
import { tenantOf } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// POST a sleep export (CSV text) → a real WearableBaseline stored per
// traveller. On success /api/trip starts returning baselineSource: "garmin"
// for this traveller instead of the sample profile. A failed parse is a 422
// that names what's missing — never a silently-shrunk baseline.

export async function POST(req: Request) {
  const text = await req.text();
  if (!text.trim()) {
    return NextResponse.json({ ok: false, error: "empty body — send the export as the request body" }, { status: 400 });
  }
  const parsed = parseGarminSleepCsv(text);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 422 });
  }
  const baseline = baselineFromNights(parsed.nights);
  await saveWearableBaseline(baseline, tenantOf(req));
  return NextResponse.json({ ok: true, baseline, nights: parsed.nights.length });
}
