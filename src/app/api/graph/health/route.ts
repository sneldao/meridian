import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gm = await import("@/domain/graph-memory");
  if (!gm.graphEnabled()) {
    return NextResponse.json({ enabled: false, reason: "FALKORDB_URL / FALKORDB_HOST not set" });
  }
  const tenant = new URL(req.url).searchParams.get("tenant") ?? undefined;
  try {
    const memory = await gm.loadGraphMemory(tenant);
    return NextResponse.json({ ...memory, enabled: true, graph: gm.graphId(tenant) });
  } catch (err) {
    return NextResponse.json(
      { enabled: false, reason: err instanceof Error ? err.message : "graph unavailable" },
      { status: 503 },
    );
  }
}