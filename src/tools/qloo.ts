// Qloo — taste/cultural intelligence for the destination. Hackathon track:
// keys only work against hackathon.api.qloo.com, auth is X-Api-Key.
// Registered as a tool only when QLOO_API_KEY is set.
//
// Verified against the docs (2026-10-15): /search takes `query`, `types`,
// `take`; /v2/insights requires `filter.type` and, for urn:entity:place,
// accepts `filter.location.query` (restricts results to places inside a named
// locality's shape) and `signal.interests.entities` (comma-separated entity
// IDs influencing affinity). Both respond { success, results: { entities } }.

const BASE = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";

export function qlooEnabled(): boolean {
  return Boolean(process.env.QLOO_API_KEY);
}

interface QlooEntity {
  entity_id?: string;
  name?: string;
  types?: string[];
  properties?: { keywords?: { name?: string }[]; tags?: { name?: string }[] };
}

async function qlooGet(pathname: string, params: Record<string, string>): Promise<unknown> {
  const key = process.env.QLOO_API_KEY;
  if (!key) return null;
  const url = `${BASE}${pathname}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": key },
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) return null;
  return res.json();
}

/** Both /search and /v2/insights wrap rows as {results:{entities:[...]}} —
 *  tolerate a bare array too so a schema drift degrades, not breaks. */
function entitiesOf(data: unknown): QlooEntity[] {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data)) return data as QlooEntity[];
  const results = (data as { results?: unknown }).results;
  if (Array.isArray(results)) return results as QlooEntity[];
  const entities = (results as { entities?: unknown } | undefined)?.entities;
  return Array.isArray(entities) ? (entities as QlooEntity[]) : [];
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
): Promise<{ destination: string; places: { name: string; categories: string[] }[]; note?: string }> {
  const dests = await searchEntities(cityName);
  const dest = dests[0];

  const params: Record<string, string> = {
    "filter.type": "urn:entity:place",
    "filter.location.query": cityName,
    take: "10",
  };
  if (dest?.entity_id) params["signal.interests.entities"] = dest.entity_id;

  let places = entitiesOf(await qlooGet("/v2/insights", params)).map(toPlace);

  // Locality names don't always match the fixture's city label — fall back to
  // a WKT POINT before declaring the destination taste-blind.
  if (!places.length) {
    const fallback: Record<string, string> = {
      "filter.type": "urn:entity:place",
      "filter.location": `POINT(${lon} ${lat})`,
      take: "10",
    };
    if (dest?.entity_id) fallback["signal.interests.entities"] = dest.entity_id;
    places = entitiesOf(await qlooGet("/v2/insights", fallback)).map(toPlace);
  }

  return {
    destination: dest?.name ?? cityName,
    places,
    ...(places.length
      ? {}
      : { note: "no places returned — check params against the entity-type parameter guide" }),
  };
}

function toPlace(e: QlooEntity): { name: string; categories: string[] } {
  return {
    name: e.name ?? "",
    categories: (e.properties?.keywords ?? e.properties?.tags ?? [])
      .map((k) => k.name ?? "")
      .filter(Boolean)
      .slice(0, 5),
  };
}
