// Disk-backed feed store shared by /api/feed and /api/feed/[id]/calendar.ics
// (route files can't export helpers). Demo-grade: artifacts/ is ephemeral on
// Render — graduate to Supabase rows in P2.
import { readFileSync } from "fs";
import path from "path";

export interface FeedRecord {
  keyHash: string;
  ics: string;
  trip: unknown;
  days: unknown;
  updatedAt: string;
}

export function readFeed(id: string): FeedRecord | null {
  if (!/^[a-f0-9]{10}$/.test(id)) return null;
  try {
    return JSON.parse(
      readFileSync(path.join(process.cwd(), "artifacts", "feeds", `${id}.json`), "utf8"),
    ) as FeedRecord;
  } catch {
    return null;
  }
}
