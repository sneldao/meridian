// Tavily — live web search for the crew. Server-side only; registered as a
// tool only when TAVILY_API_KEY is set (same pattern as the graph tools).

export interface WebHit {
  title: string;
  url: string;
  snippet: string;
  /** Which route served the hit — 'native' (Tavily) or 'sandbase'. */
  provider?: "native" | "sandbase";
}

export function tavilyEnabled(): boolean {
  return Boolean(process.env.TAVILY_API_KEY || process.env.SANDBASE_API_KEY);
}

/** General web results — current guidance, destination info, daylight
 *  practicalities. Deliberately *not* folded into state.citations: Jun cites
 *  peer-reviewed papers; these inform his read without being citable. */
const SANDBASE_BASE_URL = () =>
  (process.env.SANDBASE_BASE_URL || "https://api.sandbase.ai").replace(/\/+$/, "");

type TavilyRoute = "native" | "sandbase";

function routeOrder(): TavilyRoute[] {
  const order =
    (process.env.SEARCH_ROUTE_ORDER || "").trim().toLowerCase() === "sandbase,native"
      ? (["sandbase", "native"] as const)
      : (["native", "sandbase"] as const);
  return order.filter((r) =>
    r === "native" ? !!process.env.TAVILY_API_KEY : !!process.env.SANDBASE_API_KEY,
  );
}

type TavilyResults = {
  results?: { title?: string; url?: string; content?: string }[];
};

async function searchVia(
  route: TavilyRoute,
  query: string,
  k: number,
): Promise<TavilyResults> {
  const key =
    route === "sandbase" ? process.env.SANDBASE_API_KEY : process.env.TAVILY_API_KEY;
  const url =
    route === "sandbase"
      ? `${SANDBASE_BASE_URL()}/v1/api/tavily/search`
      : "https://api.tavily.com/search";
  const body =
    route === "sandbase"
      ? { query, max_results: k, search_depth: "basic" }
      : { api_key: key, query, max_results: k, search_depth: "basic" };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(route === "sandbase" ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error(`${route} search ${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  if (route === "sandbase") {
    const env = json as { status?: string; output?: TavilyResults };
    if (env.status !== "completed" || !env.output || typeof env.output !== "object") {
      throw new Error("sandbase response not completed");
    }
    return env.output;
  }
  return json as TavilyResults;
}

export async function searchTavily(query: string, k = 5): Promise<WebHit[]> {
  for (const route of routeOrder()) {
    try {
      const data = await searchVia(route, query, k);
      return (data.results ?? [])
        .filter((r) => r.title && r.url)
        .map((r) => ({
          title: r.title!,
          url: r.url!,
          snippet: (r.content ?? "").slice(0, 400),
          provider: route,
        }));
    } catch {
      continue;
    }
  }
  return [];
}
