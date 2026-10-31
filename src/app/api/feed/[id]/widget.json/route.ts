import { feedTokenOk, readFeed } from "@/lib/feed-store";
import { fmtMin } from "@/domain/circadian";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const feed = await readFeed(id);
  if (!feed) return new Response("not found", { status: 404 });
  const t = new URL(req.url).searchParams.get("t");
  if (!feedTokenOk(feed, "widget", t)) {
    return new Response("forbidden", { status: 403 });
  }
  const now = new Date();
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const originMin = (utcMin + feed.trip.origin.utcOffsetMin + 1440) % 1440;
  const destMin = (utcMin + feed.trip.destination.utcOffsetMin + 1440) % 1440;
  const bodyMin = (utcMin + (feed.trip.origin.utcOffsetMin + feed.trip.requiredShiftMin) + 1440) % 1440;
  const next = feed.days
    .flatMap((d) => d.interventions ?? [])
    .sort((a, b) => a.startMin - b.startMin)[0];
  const widget = {
    id,
    origin: { name: feed.trip.origin.name, localTime: fmtMin(originMin) },
    destination: { name: feed.trip.destination.name, localTime: fmtMin(destMin) },
    bodyTime: fmtMin(bodyMin),
    next: next
      ? { title: next.note, at: fmtMin(next.startMin) }
      : null,
    updatedAt: feed.updatedAt,
  };
  return new Response(JSON.stringify(widget), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
