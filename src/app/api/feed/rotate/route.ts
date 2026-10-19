// Rotate a feed's read token: the write key proves ownership, one surface's
// link dies and a fresh one is minted. This is how a traveller kills a leaked
// assistant link without re-subscribing their calendar.
import { timingSafeEqual } from "crypto";
import { rateLimit } from "@/lib/rateLimit";
import {
  FEED_SURFACES,
  mintReadToken,
  readFeed,
  sha256,
  writeFeed,
} from "@/lib/feed-store";
import type { FeedSurface } from "@/lib/feed-store";

const ID_RE = /^[a-f0-9]{10}$/;

export async function POST(req: Request) {
  const rl = rateLimit(req, "feed", { limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) {
    return Response.json({ error: "rate limited" }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    key?: string;
    surface?: string;
  } | null;
  if (!body || typeof body.id !== "string" || !ID_RE.test(body.id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  if (typeof body.key !== "string" || !body.key) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const surface = body.surface as FeedSurface;
  if (!FEED_SURFACES.includes(surface)) {
    return Response.json(
      { error: `surface must be one of: ${FEED_SURFACES.join(", ")}` },
      { status: 400 },
    );
  }
  const stored = await readFeed(body.id);
  if (!stored) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const given = Buffer.from(sha256(body.key), "hex");
  const want = Buffer.from(String(stored.keyHash), "hex");
  if (want.length !== given.length || !timingSafeEqual(want, given)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const raw = mintReadToken();
  const ok = await writeFeed(body.id, {
    ...stored,
    tokens: { ...(stored.tokens ?? {}), [surface]: sha256(raw) },
    updatedAt: new Date().toISOString(),
  });
  if (!ok) return Response.json({ error: "write failed" }, { status: 500 });
  return Response.json({ id: body.id, tokens: { [surface]: raw } });
}
