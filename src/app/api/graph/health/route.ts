import { NextResponse } from "next/server";
import { tenantOf } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const tenant = tenantOf(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401 });
  }
  const gm = await import("@/domain/graph-memory");
  if (!gm.graphEnabled()) {
    return NextResponse.json({ enabled: false, reason: "FALKORDB_URL / FALKORDB_HOST not set" });
  }
  try {
    await gm.loadGraphMemory(tenant);
    return NextResponse.json({ enabled: true, graph: gm.graphId(tenant) });
  } catch (err) {
    return NextResponse.json(
      { enabled: false, reason: err instanceof Error ? err.message : "graph unavailable" },
      { status: 503 },
    );
  }
}
