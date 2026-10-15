import { NextRequest, NextResponse } from "next/server";
import { listRuns, persistRun, supabaseEnabled } from "@/tools/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseEnabled()) {
    return NextResponse.json({ enabled: false, runs: [] });
  }
  return NextResponse.json({ enabled: true, runs: await listRuns() });
}

export async function POST(req: NextRequest) {
  if (!supabaseEnabled()) {
    return NextResponse.json({ enabled: false, ok: false }, { status: 503 });
  }
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const ok = await persistRun(body as Record<string, unknown>);
  return NextResponse.json({ enabled: true, ok }, { status: ok ? 200 : 500 });
}