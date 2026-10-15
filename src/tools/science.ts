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
        };
      });
  } catch {
    return [];
  }
}

// Verified live via the SMR API during research — used if the network fails
// mid-demo, and always used by the replay provider.
export function fallbackCitations(): Citation[] {
  return [
    {
      id: "W4309308783",
      title: "Circadian acclimatization of performance, sleep, and 6-sulfatoxymelatonin using multiple phase shifting stimuli",
      year: 2022,
      venue: "Frontiers in Endocrinology",
      doi: "10.3389/fendo.2022.964681",
      url: "https://doi.org/10.3389/fendo.2022.964681",
    },
    {
      id: "W3209274995",
      title: "Implementing a Circadian Adaptation Schedule after Eastward Flight in Young Male Athletes",
      year: 2021,
      venue: "Applied Sciences",
      doi: "10.3390/app11219962",
      url: "https://doi.org/10.3390/app11219962",
    },
    {
      id: "W2477505029",
      title: "Short Blue Light Pulses (30 Min) in the Morning Support a Sleep-Advancing Protocol in a Home Setting",
      year: 2016,
      venue: "Journal of Biological Rhythms",
      doi: "10.1177/0748730416657462",
      url: "https://doi.org/10.1177/0748730416657462",
    },
    {
      id: "W2903435945",
      title: "Strategies to decrease social jetlag: Reducing evening blue light advances sleep and melatonin",
      year: 2018,
      venue: "European Journal of Neuroscience",
      doi: "10.1111/ejn.14293",
      url: "https://doi.org/10.1111/ejn.14293",
    },
  ];
}
