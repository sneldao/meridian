// GET /api/taste?city=Tokyo&lon=139.7&lat=35.7 — the surface read for the
// "spend your daylight here" strip. Thin proxy over destinationTaste:
// without QLOO_API_KEY this is `{ enabled: false }` and the strip stays
// null (the honest empty state, not a hole). Never feeds the scorer.
import { NextResponse } from "next/server";
import { destinationTaste, qlooEnabled } from "@/tools/qloo";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!qlooEnabled()) {
    return NextResponse.json({ enabled: false, destination: null, places: [] });
  }
  const q = new URL(req.url).searchParams;
  const city = q.get("city") ?? "Tokyo";
  const lon = Number(q.get("lon") ?? "139.7");
  const lat = Number(q.get("lat") ?? "35.7");
  try {
    const out = await destinationTaste(city, lon, lat);
    return NextResponse.json({ enabled: true, ...out });
  } catch {
    return NextResponse.json({ enabled: true, destination: city, places: [], note: "taste lookup failed" });
  }
}
