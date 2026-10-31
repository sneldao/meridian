// Feed store shared by /api/feed, /api/feed/[id]/calendar.ics, and
// /api/assistant/next (route files can't export helpers).
//
// Supabase rows when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set, else
// artifacts/feeds/*.json on disk — replay/offline mode keeps working, but
// disk feeds die with the container (Render's FS is ephemeral).
//
// Expected table:
//   create table public.meridian_feeds (
//     id text primary key,
//     key_hash text not null,
//     ics text not null,
//     trip jsonb not null,
//     days jsonb not null,
//     updated_at timestamptz default now()
//   );
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { supabaseAdmin } from "@/tools/supabase";
import type { DayPlan, Trip } from "@/domain/types";

const ID_RE = /^[a-f0-9]{10}$/;
const TABLE = "meridian_feeds";

/** Read surfaces that get their own token — kill a leaked assistant link
 *  without re-subscribing the traveller's calendar. */
export const FEED_SURFACES = ["calendar", "assistant", "widget"] as const;
export type FeedSurface = (typeof FEED_SURFACES)[number];

export interface FeedRecord {
  keyHash: string;
  ics: string;
  trip: Trip;
  days: DayPlan[];
  updatedAt: string;
  /** surface → sha256 hex of the read token. Absent on feeds written before
   *  tokens existed — those stay readable on the bare id until refreshed. */
  tokens?: Record<string, string>;
}

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function mintReadToken(): string {
  return randomBytes(16).toString("hex");
}

/** A surface with a stored hash demands a matching ?t= — compared in constant
 *  time. A surface with no hash yet (pre-token feed) stays open on the bare
 *  id, which is the same exposure those links always had. */
export function feedTokenOk(
  rec: FeedRecord,
  surface: FeedSurface,
  t: string | null,
): boolean {
  const want = rec.tokens?.[surface];
  if (!want) return true;
  if (!t) return false;
  const given = Buffer.from(sha256(t), "hex");
  const stored = Buffer.from(want, "hex");
  return stored.length === given.length && timingSafeEqual(stored, given);
}

function feedFile(id: string): string {
  return path.join(process.cwd(), "artifacts", "feeds", `${id}.json`);
}

/** The trip shape a feed needs: enough for the assistant's zone math and the
 *  calendar's day mapping. Validates on write AND read — a row written by an
 *  older schema fails closed instead of crashing the readers. */
export function validTrip(t: unknown): t is Trip {
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

export function validDays(days: unknown): days is DayPlan[] {
  return (
    Array.isArray(days) &&
    days.every(
      (d) =>
        d &&
        typeof (d as { dayIndex?: unknown }).dayIndex === "number" &&
        typeof (d as { label?: unknown }).label === "string" &&
        Array.isArray((d as { interventions?: unknown }).interventions),
    )
  );
}

function parseRecord(raw: unknown): FeedRecord | null {
  const r = raw as FeedRecord | null;
  if (
    !r ||
    typeof r.keyHash !== "string" ||
    typeof r.ics !== "string" ||
    !validTrip(r.trip) ||
    !validDays(r.days)
  ) {
    return null;
  }
  const tokens =
    r.tokens && typeof r.tokens === "object"
      ? Object.fromEntries(
          Object.entries(r.tokens).filter(([, v]) => typeof v === "string"),
        )
      : undefined;
  return {
    keyHash: r.keyHash,
    ics: r.ics,
    trip: r.trip,
    days: r.days,
    tokens,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date(0).toISOString(),
  };
}

function readFeedDisk(id: string): FeedRecord | null {
  try {
    return parseRecord(JSON.parse(readFileSync(feedFile(id), "utf8")));
  } catch {
    return null;
  }
}

function writeFeedDisk(id: string, rec: FeedRecord): boolean {
  try {
    mkdirSync(path.dirname(feedFile(id)), { recursive: true });
    writeFileSync(feedFile(id), JSON.stringify(rec));
    return true;
  } catch {
    return false;
  }
}

export async function readFeed(id: string): Promise<FeedRecord | null> {
  if (!ID_RE.test(id)) return null;
  const db = supabaseAdmin();
  if (db) {
    const { data, error } = await db
      .from(TABLE)
      .select("key_hash, ics, trip, days, tokens, updated_at")
      .eq("id", id)
      .maybeSingle();
    // Table missing or the read failed → fall through to disk so a feed
    // written before the migration (or in degraded mode) still resolves.
    if (!error && data) {
      const rec = parseRecord({
        keyHash: data.key_hash,
        ics: data.ics,
        trip: data.trip,
        days: data.days,
        tokens: data.tokens,
        updatedAt: data.updated_at,
      });
      if (rec) return rec;
    }
  }
  return readFeedDisk(id);
}

export async function writeFeed(id: string, rec: FeedRecord): Promise<boolean> {
  if (!ID_RE.test(id)) return false;
  const db = supabaseAdmin();
  if (db) {
    const { error } = await db.from(TABLE).upsert({
      id,
      key_hash: rec.keyHash,
      ics: rec.ics,
      trip: rec.trip,
      days: rec.days,
      tokens: rec.tokens ?? null,
      updated_at: rec.updatedAt,
    });
    if (!error) return true;
    // Supabase unreachable or the table isn't created yet — keep the feed
    // alive on disk rather than failing the traveller's subscription.
    return writeFeedDisk(id, rec);
  }
  return writeFeedDisk(id, rec);
}
