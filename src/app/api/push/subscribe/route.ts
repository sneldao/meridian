// Push subscription management. GET tells the client whether push is
// available and hands over the VAPID public key. POST links a browser
// subscription to a feed — the write key proves the caller owns the feed.
// DELETE removes a subscription by endpoint (endpoints are unguessable,
// so no further proof is needed to stop sending to one).
import { timingSafeEqual } from "crypto";
import { rateLimit } from "@/lib/rateLimit";
import { readFeed, sha256 } from "@/lib/feed-store";
import {
  deleteSubscription,
  pushEnabled,
  saveSubscription,
  vapidPublicKey,
} from "@/lib/push";

const ID_RE = /^[a-f0-9]{10}$/;

export async function GET() {
  return Response.json({
    enabled: pushEnabled(),
    publicKey: pushEnabled() ? vapidPublicKey() : null,
  });
}

export async function POST(req: Request) {
  const rl = rateLimit(req, "push", { limit: 30, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return Response.json({ error: "rate limited" }, { status: 429 });
  if (!pushEnabled()) {
    return Response.json({ error: "push not configured" }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    key?: string;
    endpoint?: string;
    keys?: { p256dh?: unknown; auth?: unknown };
  } | null;
  if (
    !body ||
    typeof body.id !== "string" ||
    !ID_RE.test(body.id) ||
    typeof body.key !== "string" ||
    !body.key ||
    typeof body.endpoint !== "string" ||
    !body.endpoint.startsWith("https://") ||
    typeof body.keys?.p256dh !== "string" ||
    typeof body.keys?.auth !== "string"
  ) {
    return Response.json({ error: "expected { id, key, endpoint, keys }" }, { status: 400 });
  }
  const feed = await readFeed(body.id);
  if (!feed) return Response.json({ error: "not found" }, { status: 404 });
  const given = Buffer.from(sha256(body.key), "hex");
  const want = Buffer.from(String(feed.keyHash), "hex");
  if (want.length !== given.length || !timingSafeEqual(want, given)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const ok = await saveSubscription(body.id, body.endpoint, {
    p256dh: body.keys.p256dh,
    auth: body.keys.auth,
  });
  return Response.json({ ok }, { status: ok ? 200 : 500 });
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint || typeof body.endpoint !== "string") {
    return Response.json({ error: "expected { endpoint }" }, { status: 400 });
  }
  const ok = await deleteSubscription(body.endpoint);
  return Response.json({ ok });
}
