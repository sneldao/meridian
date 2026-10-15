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
  try {
    const url = `${BASE}/search?q=${encodeURIComponent(query)}&k=${k}&abstracts=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return fallbackCitations();
    const data = (await res.json()) as { results?: SmrResult[] } | SmrResult[];
    const rows = Array.isArray(data) ? data : (data.results ?? []);
    const citations = rows
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
    return citations.length ? citations : fallbackCitations();
  } catch {
    return fallbackCitations();
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
