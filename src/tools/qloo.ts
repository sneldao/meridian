// Qloo — taste/cultural intelligence for the destination. Hackathon track:
// keys only work against hackathon.api.qloo.com, auth is X-Api-Key.
// Registered as a tool only when QLOO_API_KEY is set.
//
// Verified against the docs (2026-10-15): /search takes `query`, `types`,
// `take`; /v2/insights requires `filter.type` and, for urn:entity:place,
// accepts `filter.location.query` (restricts results to places inside a named
// locality's shape) and `signal.interests.entities` (comma-separated entity
// IDs influencing affinity). Both respond { success, results: { entities } }.

import { placeKey, TASTE_ID_RE, type DestinationPlace, type TasteEntity, type TasteType } from "@/domain/taste";

const BASE = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";

export function qlooEnabled(): boolean {
  return Boolean(process.env.QLOO_API_KEY);
}

interface QlooEntity {
  entity_id?: string;
  name?: string;
  types?: string[];
  tags?: { type?: string; name?: string }[];
  properties?: {
    keywords?: { name?: string }[];
    tags?: { name?: string }[];
    is_closed?: boolean;
  };
}

const DAY_VISIT_CATEGORIES = new Set(["cafe", "coffee shop", "art gallery", "museum", "art museum", "modern art museum", "park", "garden", "botanical garden", "book store", "bookstore", "record store", "traditional teahouse", "cathedral", "church", "catholic cathedral"]);
const NOT_DAY_VISIT = /(\bbar\b|night ?club|school|educational institution|hospital|medical|office|hotel|bank|pharmacy|go kart|car rental)/i;
const TAXONOMY_TAG_TYPES = new Set(["urn:tag:category:place", "urn:tag:genre:place"]);

async function qlooGet(pathname: string, params: Record<string, string>): Promise<unknown> {
  const key = process.env.QLOO_API_KEY;
  if (!key) return null;
  const url = `${BASE}${pathname}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": key },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error("Taste service unavailable");
  return res.json();
}

/** Both /search and /v2/insights wrap rows as {results:{entities:[...]}} —
 *  tolerate a bare array too so a schema drift degrades, not breaks. */
function entitiesOf(data: unknown): QlooEntity[] {
  const rows = (d: unknown): unknown[] => {
    if (!d || typeof d !== "object") return [];
    if (Array.isArray(d)) return d;
    const results = (d as { results?: unknown }).results;
    if (Array.isArray(results)) return results;
    const entities = (results as { entities?: unknown } | undefined)?.entities;
    return Array.isArray(entities) ? entities : [];
  };
  return rows(data).filter((e): e is QlooEntity => !!e && typeof e === "object");
}

/** Resolve a place name to Qloo destination entities. */
async function searchEntities(query: string): Promise<QlooEntity[]> {
  const data = await qlooGet("/search", {
    query,
    types: "urn:entity:destination",
    take: "3",
  });
  return entitiesOf(data);
}

/** What the destination is like — venues Qloo's taste graph ranks for the
 *  locality, restricted to places physically inside it. Feeds Otto's day
 *  notes ("where daylight time can actually be spent"); never feeds the
 *  scorer or the timing. */
export async function destinationTaste(
  cityName: string,
  lon: number,
  lat: number,
  interestIds: string[] = [],
): Promise<{ destination: string; places: DestinationPlace[]; note?: string }> {
  const dests = interestIds.length ? [] : await searchEntities(cityName);
  const dest = dests[0];
  const interests = interestIds.length ? interestIds.join(",") : dest?.entity_id;

  const params: Record<string, string> = {
    "filter.type": "urn:entity:place",
    "filter.location.query": cityName,
    take: "10",
  };
  if (interests) params["signal.interests.entities"] = interests;

  let places = entitiesOf(await qlooGet("/v2/insights", params)).map(toPlace).filter((p) => p.name);

  // Locality names don't always match the fixture's city label — fall back to
  // a WKT POINT before declaring the destination taste-blind.
  if (!places.length) {
    const fallback: Record<string, string> = {
      "filter.type": "urn:entity:place",
      "filter.location": `POINT(${lon} ${lat})`,
      take: "10",
    };
    if (interests) fallback["signal.interests.entities"] = interests;
    places = entitiesOf(await qlooGet("/v2/insights", fallback)).map(toPlace).filter((p) => p.name);
  }
  places = places.filter((p, i, all) => all.findIndex((x) => placeKey(x) === placeKey(p)) === i);

  return {
    destination:
      typeof dest?.name === "string" && dest.name.trim() ? dest.name.trim() : cityName,
    places,
    ...(places.length
      ? {}
      : { note: "no places returned — check params against the entity-type parameter guide" }),
  };
}

function toPlace(e: QlooEntity): DestinationPlace {
  const taxonomy: string[] = [];
  for (const t of Array.isArray(e.tags) ? e.tags : []) {
    if (!t || typeof t !== "object" || !TAXONOMY_TAG_TYPES.has(t.type ?? "") || typeof t.name !== "string") continue;
    const n = t.name.trim();
    if (n && n.length <= 120 && !taxonomy.includes(n)) taxonomy.push(n);
  }
  const legacy = e.properties?.keywords ?? e.properties?.tags;
  const categories = (taxonomy.length
    ? taxonomy
    : (Array.isArray(legacy) ? legacy : [])
        .flatMap((k) =>
          k && typeof k === "object" && typeof k.name === "string" && k.name.trim() && k.name.trim().length <= 120 ? [k.name.trim()] : [],
        )
  ).slice(0, 5);
  return {
    ...(typeof e.entity_id === "string" && TASTE_ID_RE.test(e.entity_id) ? { id: e.entity_id } : {}),
    name: typeof e.name === "string" && e.name.trim().length <= 300 ? e.name.trim() : "",
    categories,
    daytimeCandidate:
      e.properties?.is_closed !== true &&
      taxonomy.some((n) => DAY_VISIT_CATEGORIES.has(n.toLowerCase())) &&
      !taxonomy.some((n) => NOT_DAY_VISIT.test(n)),
  };
}

export async function searchTasteEntities(query: string, type: TasteType): Promise<TasteEntity[]> {
  const data = await qlooGet("/search", { query, types: `urn:entity:${type}`, take: "6" });
  return entitiesOf(data)
    .filter(e => typeof e.entity_id === "string" && TASTE_ID_RE.test(e.entity_id) && typeof e.name === "string" && !!e.name.trim() && e.name.trim().length <= 100)
    .map(e => ({ id: e.entity_id!, name: e.name!.trim(), type }))
    .filter((e, i, all) => all.findIndex(x => x.id === e.id) === i);
}
