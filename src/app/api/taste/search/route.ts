import { NextResponse } from "next/server";
import { qlooEnabled, searchTasteEntities } from "@/tools/qloo";
import { isTasteType } from "@/domain/taste";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const rl = rateLimit(req, "taste-search", { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), ...NO_STORE } },
    );
  }
  const q = new URL(req.url).searchParams;
  const query = (q.get("q") ?? "").trim();
  const type = q.get("type") ?? "";
  if (query.length < 2 || query.length > 100 || !isTasteType(type)) {
    return NextResponse.json({ error: "Invalid search" }, { status: 400, headers: NO_STORE });
  }
  if (!qlooEnabled()) {
    return NextResponse.json({ enabled: false, entities: [] }, { headers: NO_STORE });
  }
  try {
    const entities = await searchTasteEntities(query, type);
    return NextResponse.json({ enabled: true, entities }, { headers: NO_STORE });
  } catch {
    return NextResponse.json(
      { enabled: true, entities: [], error: "Search is unavailable right now. Try again." },
      { status: 502, headers: NO_STORE },
    );
  }
}
