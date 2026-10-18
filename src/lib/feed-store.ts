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
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { supabaseAdmin } from "@/tools/supabase";
import type { DayPlan, Trip } from "@/domain/types";

const ID_RE = /^[a-f0-9]{10}$/;
const TABLE = "meridian_feeds";

export interface FeedRecord {
  keyHash: string;
  ics: string;
  trip: Trip;
  days: DayPlan[];
  updatedAt: string;
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
  return {
    keyHash: r.keyHash,
    ics: r.ics,
    trip: r.trip,
    days: r.days,
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
      .select("key_hash, ics, trip, days, updated_at")
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
      updated_at: rec.updatedAt,
    });
    if (!error) return true;
    // Supabase unreachable or the table isn't created yet — keep the feed
    // alive on disk rather than failing the traveller's subscription.
    return writeFeedDisk(id, rec);
  }
  return writeFeedDisk(id, rec);
}
