import { NextResponse } from "next/server";
import { foldCheckIns, parseCheckInText } from "@/domain/adherence";
import { listCheckIns, recordCheckIn } from "@/domain/memory";
import { ADHERENCE_PROFILE } from "@/domain/fixtures";
import type { CheckInRequest } from "@/domain/types";

export const dynamic = "force-dynamic";

// Record what the wearer actually did. Free text ("skipped the 5am light")
// parses into a structured check-in; structured fields pass straight through.
// GET returns the history so the UI can show what the crew knows.

export async function POST(req: Request) {
  let body: CheckInRequest;
  try {
    body = (await req.json()) as CheckInRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.text && !body.status) {
    return NextResponse.json({ ok: false, error: "Provide text or status" }, { status: 400 });
  }

  const checkIn = parseCheckInText(body);
  const memory = await recordCheckIn(checkIn);
  const adherence = foldCheckIns(ADHERENCE_PROFILE, memory.checkIns);
  try {
    const { persistCheckIn } = await import("@/tools/supabase");
    await persistCheckIn(checkIn);
  } catch {
    // Supabase is optional.
  }

  return NextResponse.json({ ok: true, checkIn, adherence, learned: memory.learned });
}

export async function GET() {
  const checkIns = await listCheckIns();
  const adherence = foldCheckIns(ADHERENCE_PROFILE, checkIns);
  return NextResponse.json({ checkIns, adherence });
}
