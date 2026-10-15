import { NextRequest, NextResponse } from "next/server";
import { parseCheckInText } from "@/domain/adherence";
import { recordCheckIn } from "@/domain/memory";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const checkIn = parseCheckInText(body as { text?: string; dayIndex?: number });
  await recordCheckIn(checkIn);
  return NextResponse.json({ checkIn });
}