import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Seeds/wipes the tenant graph. Exists because the Render FalkorDB pserv is
// internal-only — scripts/seed-graph.ts can't reach it from a laptop.
// Guarded by SEED_ADMIN_TOKEN; the endpoint is disabled entirely when unset.
//
//   curl -X POST /api/graph/seed -H "x-seed-token: $SEED_ADMIN_TOKEN" \
//     -H 'content-type: application/json' -d '{"tenant":"demo","reset":true}'

export async function POST(req: Request) {
  const expected = process.env.SEED_ADMIN_TOKEN;
  if (!expected) {
    return NextResponse.json({ ok: false, error: "seed endpoint disabled (SEED_ADMIN_TOKEN unset)" }, { status: 404 });
  }
  const got = req.headers.get("x-seed-token") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!got || got !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { tenant?: string; reset?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    // empty body is fine — defaults below
  }
  const tenant = body.tenant === "other" ? "other" : "demo";

  try {
    const gm = await import("@/domain/graph-memory");
    const { seedGraph, wipeGraph } = await import("@/domain/graph-seed");
    const g = await gm.graph(tenant);
    if (!g) {
      return NextResponse.json({ ok: false, error: "graph unavailable" }, { status: 503 });
    }
    if (body.reset) await wipeGraph(g);
    const nodes = await seedGraph(g, tenant);
    return NextResponse.json({ ok: true, graph: gm.graphId(tenant), nodes });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "seed failed" },
      { status: 500 },
    );
  }
}
