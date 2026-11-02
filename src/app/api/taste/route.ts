// GET /api/taste?city=Tokyo&lon=139.7&lat=35.7 — the surface read for the
// "spend your daylight here" strip. Thin proxy over destinationTaste:
// without QLOO_API_KEY this is `{ enabled: false }` and the strip stays
// null (the honest empty state, not a hole). Never feeds the scorer.
import { NextResponse } from "next/server";
import { destinationTaste, qlooEnabled } from "@/tools/qloo";
import { tasteHistory } from "@/domain/graph-memory";
import { TASTE_ID_RE, withoutDismissed } from "@/domain/taste";
import { tenantOf } from "@/lib/tenant";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const rl = rateLimit(req, "taste", { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec), ...NO_STORE } },
    );
  }
  if (!qlooEnabled()) {
    return NextResponse.json({ enabled: false, destination: null, places: [] }, { headers: NO_STORE });
  }
  const q = new URL(req.url).searchParams;
  const cityParam = q.get("city");
  const city = (cityParam ?? "Tokyo").trim();
  if (cityParam !== null && (city.length < 1 || city.length > 120)) {
    return NextResponse.json({ error: "Invalid city" }, { status: 400, headers: NO_STORE });
  }
  const lonParam = q.get("lon");
  const latParam = q.get("lat");
  const lon = lonParam === null ? 139.7 : Number(lonParam);
  const lat = latParam === null ? 35.7 : Number(latParam);
  if (
    (lonParam !== null && (!Number.isFinite(lon) || lonParam.trim() === "" || lon < -180 || lon > 180)) ||
    (latParam !== null && (!Number.isFinite(lat) || latParam.trim() === "" || lat < -90 || lat > 90))
  ) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400, headers: NO_STORE });
  }
  const interestsParam = q.get("interests");
  let interestIds: string[] = [];
  if (interestsParam !== null) {
    const raw = interestsParam.split(",");
    if (raw.length > 8 || raw.some((s) => !TASTE_ID_RE.test(s))) {
      return NextResponse.json({ error: "Invalid interests" }, { status: 400, headers: NO_STORE });
    }
    interestIds = [...new Set(raw)];
  }
  try {
    /* Remembered taste rides alongside the request's favourites: kept ids
     * join the affinity signal, dismissed places are suppressed. No graph
     * → empty history → identical behaviour. */
    const history = await tasteHistory(tenantOf(req));
    const interests = [...new Set([...interestIds, ...history.keptIds])].slice(0, 8);
    const out = await destinationTaste(city, lon, lat, interests);
    return NextResponse.json(
      { enabled: true, ...out, places: withoutDismissed(out.places, history.dismissed) },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { enabled: true, destination: city, places: [], error: "Places are unavailable right now. Try again." },
      { status: 502, headers: NO_STORE },
    );
  }
}
