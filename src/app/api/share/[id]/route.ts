// The share payload as data: GET backs the ?via= acknowledgment on Home (the
// same information the public /plan/{id} page renders — nothing here is
// private). POST {recipient:true} counts a share-page visit that ended in a
// committed trip — the funnel's bottom metric.
import { loadSharedPlan, recordShareRecipient } from "@/lib/share";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const data = await loadSharedPlan(id);
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ payload: data });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (body?.recipient !== true) {
    return Response.json({ error: "expected {recipient:true}" }, { status: 400 });
  }
  const ok = await recordShareRecipient(id);
  return Response.json({ ok });
}
