// Tavily — live web search for the crew. Server-side only; registered as a
// tool only when TAVILY_API_KEY is set (same pattern as the graph tools).

export interface WebHit {
  title: string;
  url: string;
  snippet: string;
}

export function tavilyEnabled(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

/** General web results — current guidance, destination info, daylight
 *  practicalities. Deliberately *not* folded into state.citations: Jun cites
 *  peer-reviewed papers; these inform his read without being citable. */
export async function searchTavily(query: string, k = 5): Promise<WebHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: k,
        search_depth: "basic",
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: { title?: string; url?: string; content?: string }[];
    };
    return (data.results ?? [])
      .filter((r) => r.title && r.url)
      .map((r) => ({ title: r.title!, url: r.url!, snippet: (r.content ?? "").slice(0, 400) }));
  } catch {
    return [];
  }
}
