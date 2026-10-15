import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.FALKORDB_URL) {
    return NextResponse.json({ enabled: false, reason: "FALKORDB_URL not set" });
  }
  try {
    const gm = await import("@/domain/graph-memory");
    const memory = await gm.loadGraphMemory();
    return NextResponse.json({ ...memory, enabled: true });
  } catch (err) {
    return NextResponse.json(
      { enabled: false, reason: err instanceof Error ? err.message : "graph unavailable" },
      { status: 503 },
    );
  }
}