import {
  isDestinationPlace,
  type DestinationPlace,
} from "@/domain/taste";

/* The device cache rung of the taste ladder (agent-native §4b, move 4): a
 * live answer is written through to localStorage when it resolves, and the
 * next run rides it when the live lookup can't be reached — below live,
 * above the recorded pool. Best-effort like every local write: reads
 * validate, writes are capped and callers catch quota failures. */

export const TASTE_CACHE_KEY = "meridian:taste-cache";
export const TASTE_CACHE_MAX_ENTRIES = 20;
export const TASTE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Bound one entry so a hand-edited blob can't stuff the param. */
const MAX_ENTRY_PLACES = 12;
const MAX_SERIALIZED = 8 * 1024;

/** What the live rung produced for one dest+interests — stored so a later
 *  run can answer `cached` when the lookup is unreachable. `tier` is pinned
 *  to the rung that writes it: only `live` answers are ever cached. */
export interface TasteCacheEntry {
  places: DestinationPlace[];
  eveningPlaces?: DestinationPlace[];
  resolvedAt: number;
  tier: "live";
}
export type TasteCache = Record<string, TasteCacheEntry>;

/* FNV-1a — a stable, inspectable interest-ids hash; both ends of the wire
 * (the reader in page.tsx, any later writer) compute the same key. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** `{dest}:{sorted-interest-ids-hash}` — the exact pool identity a cached
 *  entry answers. Different interests → a different key → a clean miss. */
export function tasteCacheKey(destination: string, interestIds: string[]): string {
  const sorted = [...new Set(interestIds)].sort().join(",");
  return `${destination.trim().toLowerCase()}:${fnv1a(sorted)}`;
}

export function isTasteCacheEntry(v: unknown): v is TasteCacheEntry {
  if (!v || typeof v !== "object") return false;
  const o = v as { places?: unknown; eveningPlaces?: unknown; resolvedAt?: unknown; tier?: unknown };
  if (o.tier !== "live") return false;
  if (!Number.isSafeInteger(o.resolvedAt) || (o.resolvedAt as number) <= 0) return false;
  if (!Array.isArray(o.places) || o.places.length === 0 || o.places.length > MAX_ENTRY_PLACES) return false;
  if (!o.places.every(isDestinationPlace)) return false;
  if (o.eveningPlaces !== undefined) {
    if (!Array.isArray(o.eveningPlaces) || o.eveningPlaces.length > 3) return false;
    if (!o.eveningPlaces.every(isDestinationPlace)) return false;
  }
  return true;
}

/** The whole cache map, bad entries dropped — localStorage is user-writable. */
export function readTasteCache(storage: Pick<Storage, "getItem">): TasteCache {
  let raw: string | null;
  try {
    raw = storage.getItem(TASTE_CACHE_KEY);
  } catch {
    return {};
  }
  if (raw === null || raw.length > 64_000) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: TasteCache = {};
    for (const [k, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isTasteCacheEntry(entry)) out[k] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

/** The entry for one key, only while it's fresh — stale (>7d) entries fall
 *  through to the rungs below, they never answer. */
export function readTasteCacheEntry(
  storage: Pick<Storage, "getItem">,
  key: string,
  now = Date.now(),
): TasteCacheEntry | null {
  const entry = readTasteCache(storage)[key];
  if (!entry) return null;
  if (now - entry.resolvedAt > TASTE_CACHE_MAX_AGE_MS) return null;
  return entry;
}

/** Merge an entry into the map: stale entries pruned, then FIFO-evicted to
 *  the cap — object key order is insertion order, so the front is oldest.
 *  Pure: tests drive the bound without a Storage. */
export function mergeTasteCache(
  cache: TasteCache,
  key: string,
  entry: TasteCacheEntry,
  now = Date.now(),
): TasteCache {
  const next: TasteCache = {};
  for (const [k, e] of Object.entries(cache)) {
    if (k === key) continue;
    if (now - e.resolvedAt > TASTE_CACHE_MAX_AGE_MS) continue;
    next[k] = e;
  }
  /* A stale incoming entry prunes itself — the map never carries what the
   *  ladder would refuse to ride. */
  if (now - entry.resolvedAt <= TASTE_CACHE_MAX_AGE_MS) next[key] = entry;
  const keys = Object.keys(next);
  while (keys.length > TASTE_CACHE_MAX_ENTRIES) {
    const oldest = keys.shift()!;
    delete next[oldest];
  }
  return next;
}

/** Write-through: persist one live answer under its key. May throw on
 *  quota — storage is best-effort; callers wrap like every local write. */
export function writeTasteCacheEntry(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  entry: TasteCacheEntry,
  now = Date.now(),
): void {
  if (!isTasteCacheEntry(entry)) return;
  const serialized = JSON.stringify(mergeTasteCache(readTasteCache(storage), key, entry, now));
  storage.setItem(TASTE_CACHE_KEY, serialized);
}

/** The `tasteCache` run param — the device offers its matching entry and
 *  the ladder decides whether it rides. Malformed input drops to null, the
 *  same as offering nothing: a cache hint never gates the run. */
export function parseTasteCacheParam(raw: string | null): TasteCacheEntry | null {
  if (raw === null || raw.length > MAX_SERIALIZED) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isTasteCacheEntry(value) ? value : null;
  } catch {
    return null;
  }
}
