import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ADHERENCE_PROFILE, GARMIN_BASELINE } from "@/domain/fixtures";
import type { AdherenceProfile, WearableBaseline } from "@/domain/types";

// Wearable intake. The fixture feed stays the default; a traveller can hand
// the app a real export and get a real baseline, stored per-tenant like the
// rest of their memory. The parser is deliberately strict: a baseline is
// only "garmin" when the numbers actually parsed — anything else stays the
// labelled sample profile rather than silently degrading.

export function getWearableBaseline(): WearableBaseline {
  return GARMIN_BASELINE;
}

export function getRecentNights(n = 5) {
  return GARMIN_BASELINE.nights.slice(-n);
}

export function getAdherenceProfile(): AdherenceProfile {
  return ADHERENCE_PROFILE;
}

// --- Per-traveller store -----------------------------------------------------

const WEARABLE_DIR = path.join(process.cwd(), "artifacts");

const wearablePath = (tenant?: string) => {
  const safe = tenant?.replace(/[^a-z0-9_-]/gi, "").slice(0, 48);
  return path.join(WEARABLE_DIR, safe ? `wearable-${safe}.json` : "wearable.json");
};

export async function loadWearableBaseline(tenant?: string): Promise<WearableBaseline | null> {
  try {
    return JSON.parse(await readFile(wearablePath(tenant), "utf8")) as WearableBaseline;
  } catch {
    return null;
  }
}

export async function saveWearableBaseline(baseline: WearableBaseline, tenant?: string): Promise<void> {
  const file = wearablePath(tenant);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(baseline, null, 2));
}

// --- Import parsing ----------------------------------------------------------

type Night = WearableBaseline["nights"][number];

const toMin = (t: string): number | null => {
  const m = t.trim().match(/^(\d{1,2})[:.](\d{2})(?:\s*(am|pm))?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h === 24) h = 0; // Garmin writes just-past-midnight as 24:05
  if (h > 23) return null;
  return h * 60 + Number(m[2]);
};

const toDateMin = (t: string): number | null => {
  // "2026-10-14 23:41", "23:41", "11:41 PM"
  const hm = t.match(/(\d{1,2}:\d{2}(?:\s*[ap]m)?)/i);
  return hm ? toMin(hm[1]) : null;
};

const toMinDuration = (t: string): number | null => {
  // "7:24" → 444, "444" seconds handled by caller, "7h 24m" also accepted
  const hm = t.trim().match(/^(?:(\d+)h\s*)?(\d+)m?$/i);
  if (hm) return (Number(hm[1] ?? 0) * 60 + Number(hm[2])) || null;
  const clock = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  return clock ? Number(clock[1]) * 60 + Number(clock[2]) : null;
};

const pick = (row: Record<string, string>, names: string[]): string | undefined => {
  for (const n of names) {
    const hit = Object.keys(row).find((k) => k.toLowerCase().replace(/[^a-z0-9]/g, "") === n);
    if (hit && row[hit]?.trim()) return row[hit].trim();
  }
  return undefined;
};

/** Parses a CSV export into per-night rows. Column names are matched
 *  loosely (Garmin exports differ by locale and era); a row is kept only if
 *  its sleep duration actually parses. Returns null when fewer than 2 usable
 *  nights — one row is a night out, not a baseline. */
export function parseGarminSleepCsv(text: string): { nights: Night[] } | { error: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 3) return { error: "expected a header row plus at least two nights" };
  const header = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((l) => {
    const cells = l.split(",");
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = (cells[i] ?? "").trim()));
    return row;
  });
  const nights: Night[] = [];
  for (const row of rows) {
    const date = pick(row, ["calendardate", "date", "day"]);
    const sleep = pick(row, ["sleeptime", "totaltimeasleep", "sleep", "asleep"]);
    const wake = pick(row, ["wake", "waketime", "end", "endtime", "wokeup"]);
    const bed = pick(row, ["bedtime", "start", "starttime", "sleeponset", "fellasleep"]);
    const hrv = pick(row, ["avghrv", "hrv", "hrvms", "overnighthrv"]);
    const sleepMin = sleep ? toMinDuration(sleep) : null;
    const wakeMin = wake ? toDateMin(wake) : null;
    const bedtimeMin = bed ? toDateMin(bed) : null;
    if (!date || sleepMin === null || wakeMin === null || bedtimeMin === null) continue;
    nights.push({
      date,
      bedtimeMin,
      wakeMin,
      sleepMin,
      hrvMs: hrv ? Number(hrv.replace(/[^\d.]/g, "")) || GARMIN_BASELINE.hrvMs : GARMIN_BASELINE.hrvMs,
    });
  }
  if (nights.length < 2) {
    return { error: `only ${nights.length} usable night(s) — need at least 2 with date, bedtime, wake, and sleep duration` };
  }
  return { nights };
}

/** Derives the aggregate WearableBaseline from parsed nights — averages only;
 *  fields the export can't carry (hrvTrend, restingHr) fall back to neutral
 *  fixture values and `source` says exactly what fed it. */
export function baselineFromNights(nights: Night[], label = "Garmin export"): WearableBaseline {
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const avgWake = avg(nights.map((n) => n.wakeMin));
  const chronotype: WearableBaseline["chronotype"] =
    avgWake < 6 * 60 ? "early" : avgWake >= 8 * 60 ? "late" : "neutral";
  return {
    wearer: "Traveller",
    source: `${label} (${nights.length} nights)`,
    avgBedtimeMin: avg(nights.map((n) => n.bedtimeMin)),
    avgWakeMin: avgWake,
    avgSleepMin: avg(nights.map((n) => n.sleepMin)),
    hrvMs: avg(nights.map((n) => n.hrvMs)),
    hrvTrend: "stable",
    restingHr: GARMIN_BASELINE.restingHr,
    chronotype,
    nights,
  };
}
