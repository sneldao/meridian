// POST /api/taste/feedback — the traveller's verdict on a suggested place
// (kept / swapped / dismissed) lands as a graph edge so future taste reads
// boost and suppress instead of re-asking. Best-effort like the graph
// itself: 204 whether or not the edge landed.
import { NextResponse } from "next/server";
import { recordTasteSignal, type TasteSignalStatus } from "@/domain/graph-memory";
import { TASTE_ID_RE } from "@/domain/taste";
import { tenantOf } from "@/lib/tenant";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const STATUSES = new Set(["kept", "swapped", "dismissed"]);

export async function POST(req: Request) {
  const tenant = tenantOf(req);
  if (!tenant) {
    return NextResponse.json({ error: "session required" }, { status: 401, headers: NO_STORE });
  }
  const rl = rateLimit(req, "taste-feedback", { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), ...NO_STORE } },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const o = body as { status?: unknown; place?: unknown } | null;
  const p = (o?.place ?? null) as { id?: unknown; name?: unknown } | null;
  if (
    !o ||
    typeof o !== "object" ||
    typeof o.status !== "string" ||
    !STATUSES.has(o.status) ||
    !p ||
    typeof p !== "object" ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    p.name.length > 300 ||
    (p.id !== undefined && (typeof p.id !== "string" || !TASTE_ID_RE.test(p.id)))
  ) {
    return NextResponse.json({ error: "invalid taste signal" }, { status: 400, headers: NO_STORE });
  }
  await recordTasteSignal(
    o.status as TasteSignalStatus,
    { name: p.name.trim(), ...(typeof p.id === "string" ? { id: p.id } : {}) },
    tenant,
  );
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
