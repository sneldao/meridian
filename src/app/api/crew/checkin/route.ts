import { NextResponse } from "next/server";
import { foldCheckIns, parseCheckInText } from "@/domain/adherence";
import { listCheckIns, recordCheckIn } from "@/domain/memory";
import { ADHERENCE_PROFILE } from "@/domain/fixtures";
import { tenantOf } from "@/lib/tenant";
import type { CheckInRequest } from "@/domain/types";

export const dynamic = "force-dynamic";

// Record what the wearer actually did. Free text ("skipped the 5am light")
// parses into a structured check-in; structured fields pass straight through.
// GET returns the history so the UI can show what the crew knows.

export async function POST(req: Request) {
  const tenant = tenantOf(req);
  if (!tenant) {
    return NextResponse.json({ ok: false, error: "session required" }, { status: 401 });
  }
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
  const memory = await recordCheckIn(checkIn, tenant);
  const adherence = foldCheckIns(ADHERENCE_PROFILE, memory.checkIns);
  // Optional writes are bonus paths — bounded so a slow remote (a cold
  // FalkorDB instance can take seconds) never holds the response hostage.
  const bonusWrites: Promise<unknown>[] = [
    (async () => {
      const { persistCheckIn } = await import("@/tools/supabase");
      await persistCheckIn(checkIn, tenant);
    })(),
    (async () => {
      const { recordCheckInToGraph } = await import("@/domain/graph-memory");
      await recordCheckInToGraph(checkIn, tenant);
    })(),
  ];
  await Promise.race([
    Promise.allSettled(bonusWrites),
    new Promise((r) => setTimeout(r, 4000)),
  ]);

  return NextResponse.json({ ok: true, checkIn, adherence, learned: memory.learned });
}

export async function GET(req: Request) {
  const tenant = tenantOf(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401 });
  }
  const checkIns = await listCheckIns(tenant);
  const adherence = foldCheckIns(ADHERENCE_PROFILE, checkIns);
  return NextResponse.json({ checkIns, adherence });
}
