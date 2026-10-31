// GET /api/funnel/summary — the readable half of the round-17 funnel.
// Locked behind FUNNEL_SUMMARY_KEY: the funnel is a product metric, not a
// public surface. Without Supabase it answers honestly (configured: false)
// instead of pretending there is data.
import { timingSafeEqual, createHash } from "node:crypto";
import { rateLimit } from "@/lib/rateLimit";
import { aggregateFunnel, type FunnelEventRow } from "@/lib/funnel-summary";
import { FUNNEL_STAGES } from "@/lib/funnel";
import { supabaseAdmin } from "@/tools/supabase";

function keyMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const expected = process.env.FUNNEL_SUMMARY_KEY;
  if (!expected) {
    return Response.json(
      { error: "summary locked — set FUNNEL_SUMMARY_KEY to read the funnel" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const provided = req.headers.get("x-funnel-key") ?? url.searchParams.get("key") ?? "";
  if (!provided || !keyMatches(provided, expected)) {
    return Response.json({ error: "bad key" }, { status: 403 });
  }

  const rl = rateLimit(req, "funnel-summary", { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return Response.json({ error: "rate limited" }, { status: 429 });

  const windowDays = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 90);

  const sb = supabaseAdmin();
  if (!sb) {
    return Response.json({
      configured: false,
      summary: aggregateFunnel([], { windowDays }),
    });
  }

  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("meridian_funnel")
    .select("stage, trip, at")
    .gte("at", cutoff)
    .order("at", { ascending: false })
    .limit(10000);
  if (error) {
    return Response.json({ error: "funnel read failed" }, { status: 502 });
  }

  const rows = (data ?? []).filter((r): r is FunnelEventRow =>
    FUNNEL_STAGES.includes(r.stage as (typeof FUNNEL_STAGES)[number]),
  );
  return Response.json({
    configured: true,
    summary: aggregateFunnel(rows, { windowDays }),
  });
}
