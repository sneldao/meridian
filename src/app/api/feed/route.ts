// Calendar feeds: POST a plan's ics + trip, get a webcal URL back that stays
// current as the plan changes. Backed by Supabase when configured, else
// artifacts on disk — see src/lib/feed-store.ts for the store and the table.
import { randomBytes, createHash, timingSafeEqual } from "crypto";
import { rateLimit } from "@/lib/rateLimit";
import { readFeed, validDays, validTrip, writeFeed } from "@/lib/feed-store";

const ID_RE = /^[a-f0-9]{10}$/;
const MAX_ICS = 300 * 1024;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function POST(req: Request) {
  const rl = rateLimit(req, "feed", { limit: 60, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) {
    return Response.json({ error: "rate limited" }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    key?: string;
    ics?: string;
    trip?: unknown;
    days?: unknown;
  } | null;
  if (
    !body ||
    typeof body.ics !== "string" ||
    !body.ics.startsWith("BEGIN:VCALENDAR") ||
    body.ics.length > MAX_ICS ||
    !Array.isArray(body.days) ||
    body.days.length > 30 ||
    !validDays(body.days) ||
    !validTrip(body.trip)
  ) {
    return Response.json({ error: "expected { ics, trip, days }" }, { status: 400 });
  }

  if (body.id) {
    // Update path: the write key proves ownership — only its hash is stored.
    if (!ID_RE.test(body.id)) {
      return Response.json({ error: "invalid id" }, { status: 400 });
    }
    if (typeof body.key !== "string" || !body.key) {
      return Response.json({ error: "forbidden" }, { status: 403 });
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
    const ok = await writeFeed(body.id, {
      keyHash: sha256(body.key),
      ics: body.ics,
      trip: body.trip,
      days: body.days,
      updatedAt: new Date().toISOString(),
    });
    return Response.json(ok ? { id: body.id } : { error: "write failed" }, {
      status: ok ? 200 : 500,
    });
  }

  const id = randomBytes(5).toString("hex"); // unguessable enough for a demo
  const key = randomBytes(16).toString("hex");
  const ok = await writeFeed(id, {
    keyHash: sha256(key),
    ics: body.ics,
    trip: body.trip,
    days: body.days,
    updatedAt: new Date().toISOString(),
  });
  if (!ok) return Response.json({ error: "write failed" }, { status: 500 });
  return Response.json({ id, key });
}
