import { CITATION_CATALOGUE } from "@/domain/citations";
import type { Citation } from "@/domain/types";

// ScienceMadeReadable — free OpenAlex search, no key. Server-side only.
const BASE = "https://api.sciencemadereadable.com/api/data";

interface SmrResult {
  id?: string;
  doi?: string | null;
  title?: string;
  year?: number;
  venue?: string;
  openalex?: string;
}

export async function searchScience(query: string, k = 6): Promise<Citation[]> {
  const smr = await searchSmr(query, k);
  if (smr.length) return smr;
  const fc = await searchFirecrawl(query, k);
  if (fc.length) return fc;
  return fallbackCitations();
}

async function searchSmr(query: string, k: number): Promise<Citation[]> {
  try {
    const url = `${BASE}/search?q=${encodeURIComponent(query)}&k=${k}&abstracts=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: SmrResult[] } | SmrResult[];
    const rows = Array.isArray(data) ? data : (data.results ?? []);
    return rows
      .filter((r) => r.title)
      .map((r) => ({
        id: r.id ?? r.doi ?? r.title!,
        title: r.title!,
        year: r.year,
        venue: r.venue,
        doi: r.doi ?? undefined,
        url: r.doi
          ? `https://doi.org/${r.doi}`
          : (r.openalex ?? `https://sciencemadereadable.com/?work=${r.id}`),
        source: "live" as const,
      }));
  } catch {
    return [];
  }
}

// Firecrawl Research Index — 41M+ life-science papers, second provider when
// FIRECRAWL_API_KEY is set. Response: { data: { papers: [...] } }.
interface FcPaper {
  paperId?: string;
  title?: string;
  abstract?: string;
  ids?: Record<string, string>;
  score?: number;
  year?: number;
}

async function searchFirecrawl(query: string, k: number): Promise<Citation[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://api.firecrawl.dev/search/research/papers?q=${encodeURIComponent(query)}&limit=${k}`,
      { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(9000) },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { papers?: FcPaper[] } | FcPaper[]; papers?: FcPaper[] };
    const inner = data.data;
    const rows = Array.isArray(inner) ? inner : (inner?.papers ?? data.papers ?? []);
    return rows
      .filter((p) => p.title)
      .map((p) => {
        const doi = p.ids?.doi ?? p.ids?.DOI;
        return {
          id: p.paperId ?? doi ?? p.title!,
          title: p.title!,
          year: p.year,
          doi,
          url: doi ? `https://doi.org/${doi}` : `https://sciencemadereadable.com/?work=${p.paperId}`,
          source: "live" as const,
        };
      });
  } catch {
    return [];
  }
}

// Verified live via the SMR API during research — used if the network fails
// mid-demo, and always used by the replay provider.
//
// The list itself lives in domain/citations: the catalogue is shared with the
// evidence table, so a citation id means the same paper everywhere and the
// scorer's UNKNOWN_CITATION gate can resolve it. The replay provider cites
// the first four by index, so the order in the catalogue is load-bearing.
export function fallbackCitations(): Citation[] {
  return CITATION_CATALOGUE.slice();
}
