// Calendar feeds: POST a plan's ics + trip, get a webcal URL back that stays
// current as the plan changes. Artifacts on disk (demo-grade — Render's FS is
// ephemeral; graduate to Supabase rows in P2). Reader lives in
// src/lib/feed-store.ts (route files can't export helpers).
import { randomBytes, createHash } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { rateLimit } from "@/lib/rateLimit";

const ID_RE = /^[a-f0-9]{10}$/;
const MAX_ICS = 300 * 1024;

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function validTrip(t: unknown): boolean {
  const trip = t as {
    origin?: { name?: unknown; utcOffsetMin?: unknown };
    destination?: { name?: unknown; utcOffsetMin?: unknown };
    departureDayIndex?: unknown;
    days?: unknown;
  } | null;
  return Boolean(
    trip &&
      typeof trip.origin?.name === "string" &&
      typeof trip.origin?.utcOffsetMin === "number" &&
      typeof trip.destination?.name === "string" &&
      typeof trip.destination?.utcOffsetMin === "number" &&
      typeof trip.departureDayIndex === "number" &&
      Array.isArray(trip.days) &&
      trip.days.every(
        (d) =>
          d &&
          typeof (d as { dayIndex?: unknown }).dayIndex === "number" &&
          typeof (d as { label?: unknown }).label === "string" &&
          typeof (d as { date?: unknown }).date === "string",
      ),
  );
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
    !validTrip(body.trip)
  ) {
    return Response.json({ error: "expected { ics, trip, days }" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "artifacts", "feeds");
  mkdirSync(dir, { recursive: true });

  if (body.id) {
    // Update path: the write key proves ownership — only its hash is stored.
    if (!ID_RE.test(body.id)) {
      return Response.json({ error: "invalid id" }, { status: 400 });
    }
    if (typeof body.key !== "string" || !body.key) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const file = path.join(dir, `${body.id}.json`);
    let stored: { keyHash: string };
    try {
      stored = JSON.parse(readFileSync(file, "utf8")) as { keyHash: string };
    } catch {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    if (stored.keyHash !== sha256(body.key)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    writeFileSync(
      file,
      JSON.stringify({
        keyHash: sha256(body.key),
        ics: body.ics,
        trip: body.trip,
        days: body.days,
        updatedAt: new Date().toISOString(),
      }),
    );
    return Response.json({ id: body.id });
  }

  const id = randomBytes(5).toString("hex"); // unguessable enough for a demo
  const key = randomBytes(16).toString("hex");
  writeFileSync(
    path.join(dir, `${id}.json`),
    JSON.stringify({
      keyHash: sha256(key),
      ics: body.ics,
      trip: body.trip,
      days: body.days,
      updatedAt: new Date().toISOString(),
    }),
  );
  return Response.json({ id, key });
}
