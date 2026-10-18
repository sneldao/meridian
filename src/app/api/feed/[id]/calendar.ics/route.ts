import { readFeed } from "@/lib/feed-store";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const feed = readFeed(id);
  if (!feed) return new Response("not found", { status: 404 });
  return new Response(feed.ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  });
}
