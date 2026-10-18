import { feedTokenOk, readFeed } from "@/lib/feed-store";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const feed = await readFeed(id);
  if (!feed) return new Response("not found", { status: 404 });
  const t = new URL(req.url).searchParams.get("t");
  if (!feedTokenOk(feed, "calendar", t)) {
    return new Response("forbidden", { status: 403 });
  }
  return new Response(feed.ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  });
}
