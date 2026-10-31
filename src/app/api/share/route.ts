// Shareable plan cards: POST a briefing, get a /plan/{id} link. Durable in
// Supabase (meridian_shares) when configured, filesystem fallback otherwise —
// replay mode needs zero services. Writer/reader live in src/lib/share.ts
// (route files can't export helpers).
import { saveSharedPlan } from "@/lib/share";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const b = body?.briefing;
  if (!b || typeof b.summary !== "string" || !Array.isArray(b.days)) {
    return Response.json({ error: "expected {briefing: {summary, days, ...}}" }, { status: 400 });
  }
  const id = await saveSharedPlan({ briefing: b, trip: body.trip ?? null });
  return Response.json({ id, url: `/plan/${id}` });
}
