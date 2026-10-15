import { NextRequest, NextResponse } from "next/server";
import { parseCheckInText } from "@/domain/adherence";
import type { CheckInRequest } from "@/domain/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const checkIn = parseCheckInText(body as CheckInRequest);
  return NextResponse.json({ checkIn });
}