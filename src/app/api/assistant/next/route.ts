import { feedTokenOk, readFeed } from "@/lib/feed-store";
import { nextStepFromPlan } from "@/lib/assistant";
import { rateLimit } from "@/lib/rateLimit";

export async function GET(req: Request) {
  const rl = rateLimit(req, "assistant", { limit: 120, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return Response.json({ error: "rate limited" }, { status: 429 });
  const url = new URL(req.url);
  const id = url.searchParams.get("feed") ?? "";
  const record = await readFeed(id);
  if (!record) return Response.json({ error: "not found" }, { status: 404 });
  if (!feedTokenOk(record, "assistant", url.searchParams.get("t"))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const step = nextStepFromPlan({ trip: record.trip, days: record.days }, new Date());
  const speech = step ? step.speech : "You've finished your plan.";
  if (url.searchParams.get("format") === "text") {
    return new Response(speech, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return Response.json({ speech, step });
}
