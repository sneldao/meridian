// Funnel events — the measurable half of the journey (src/lib/funnel.ts).
// Writes are fire-and-forget from the client; when Supabase isn't configured
// the endpoint no-ops honestly (204) rather than pretending to store.
import { FUNNEL_STAGES, type FunnelStage } from "@/lib/funnel";
import { rateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/tools/supabase";

const STAGES = new Set<string>(FUNNEL_STAGES);

export async function POST(req: Request) {
  const rl = rateLimit(req, "funnel", { limit: 120, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return Response.json({ error: "rate limited" }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const { stage, trip, at } = (body ?? {}) as {
    stage?: string;
    trip?: string | null;
    at?: string;
  };
  if (!stage || !STAGES.has(stage)) {
    return Response.json({ error: "unknown stage" }, { status: 400 });
  }
  if (trip !== undefined && trip !== null && (typeof trip !== "string" || trip.length > 64)) {
    return Response.json({ error: "bad trip key" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  if (!sb) return new Response(null, { status: 204 });
  await sb.from("meridian_funnel").insert({
    stage: stage as FunnelStage,
    trip: trip ?? null,
    at: typeof at === "string" && at.length <= 40 ? at : new Date().toISOString(),
  });
  return new Response(null, { status: 204 });
}
