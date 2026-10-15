// Qloo — taste/cultural intelligence for the destination. Hackathon track:
// keys only work against hackathon.api.qloo.com, auth is X-Api-Key.
// Registered as a tool only when QLOO_API_KEY is set.

const BASE = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";

export function qlooEnabled(): boolean {
  return Boolean(process.env.QLOO_API_KEY);
}

interface QlooEntity {
  entity_id?: string;
  name?: string;
  types?: string[];
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

/** Resolve a place name to Qloo destination entities. */
async function searchEntities(query: string): Promise<QlooEntity[]> {
  const data = (await qlooGet("/search", {
    query,
    types: "urn:entity:destination",
    take: "3",
  })) as { results?: QlooEntity[] } | QlooEntity[] | null;
  if (!data) return [];
  return Array.isArray(data) ? data : (data.results ?? []);
}

/** What the destination is like — venues and categories Qloo's taste graph
 *  associates with it. Feeds Otto's day notes ("where daylight time can
 *  actually be spent"); never feeds the scorer or the timing. */
export async function destinationTaste(
  cityName: string,
  lon: number,
  lat: number,
): Promise<{ destination: string; places: { name: string; categories: string[] }[]; note?: string }> {
  const dests = await searchEntities(cityName);
  const dest = dests[0];

  const params: Record<string, string> = {
    "filter.type": "urn:entity:place",
    "filter.location": `POINT(${lon} ${lat})`,
    take: "10",
  };
  if (dest?.entity_id) params["signal.interests.entities"] = dest.entity_id;

  const data = (await qlooGet("/v2/insights", params)) as
    | { results?: { entities?: { name?: string; properties?: { keywords?: { name?: string }[] } }[] } }
    | null;
  const entities = data?.results?.entities ?? [];
  const places = entities
    .filter((e) => e.name)
    .map((e) => ({
      name: e.name!,
      categories: (e.properties?.keywords ?? []).map((k) => k.name ?? "").filter(Boolean).slice(0, 5),
    }));

  return {
    destination: dest?.name ?? cityName,
    places,
    ...(places.length
      ? {}
      : { note: "no places returned — check params against the entity-type parameter guide" }),
  };
}
