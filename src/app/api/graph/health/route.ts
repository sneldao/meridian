import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!process.env.FALKORDB_URL) {
    return NextResponse.json({ enabled: false, reason: "FALKORDB_URL not set" });
  }
  const tenant = new URL(req.url).searchParams.get("tenant") ?? undefined;
  try {
    const gm = await import("@/domain/graph-memory");
    const memory = await gm.loadGraphMemory(tenant);
    return NextResponse.json({ ...memory, enabled: true, graph: gm.graphId(tenant) });
  } catch (err) {
    return NextResponse.json(
      { enabled: false, reason: err instanceof Error ? err.message : "graph unavailable" },
      { status: 503 },
    );
  }
}