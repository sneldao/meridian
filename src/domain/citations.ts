// One catalogue of papers the app is allowed to cite.
//
// There used to be a list per module, which meant a paper could be "verified"
// in one place and invisible in another, and the evidence table's ids could
// never resolve against the ids the research agent actually returned. The
// catalogue is now the single source: the research agent's fallback set, the
// evidence seed table's back-references, and the UI's citation lists all read
// from here, so an id either resolves or it does not exist.
//
// The first four entries are the SMR-verified set the replay provider cites by
// index — do not reorder them. The rest are the curated jet-lag protocol
// papers the evidence table grades interventions against.
//
// `source` says where a citation came from, not how good it is:
//   · "live"            — retrieved this run from the paper search
//   · "verified-fallback" — curated here, checked against the publisher record

import type { Citation } from "./types";

/** The curated set. Ids are stable: they are keys into the evidence table
 *  and into the plan's `citationId` fields, and the scorer's UNKNOWN_CITATION
 *  gate resolves them. */
export const CITATION_CATALOGUE: Citation[] = [
  {
    id: "W4309308783",
    source: "verified-fallback",
    title:
      "Circadian acclimatization of performance, sleep, and 6-sulfatoxymelatonin using multiple phase shifting stimuli",
    year: 2022,
    venue: "Frontiers in Endocrinology",
    doi: "10.3389/fendo.2022.964681",
    url: "https://doi.org/10.3389/fendo.2022.964681",
  },
  {
    id: "W3209274995",
    source: "verified-fallback",
    title:
      "Implementing a Circadian Adaptation Schedule after Eastward Flight in Young Male Athletes",
    year: 2021,
    venue: "Applied Sciences",
    doi: "10.3390/app11219962",
    url: "https://doi.org/10.3390/app11219962",
  },
  {
    id: "W2477505029",
    source: "verified-fallback",
    title:
      "Short Blue Light Pulses (30 Min) in the Morning Support a Sleep-Advancing Protocol in a Home Setting",
    year: 2016,
    venue: "Journal of Biological Rhythms",
    doi: "10.1177/0748730416657462",
    url: "https://doi.org/10.1177/0748730416657462",
  },
  {
    id: "W2903435945",
    source: "verified-fallback",
    title:
      "Strategies to decrease social jetlag: Reducing evening blue light advances sleep and melatonin",
    year: 2018,
    venue: "European Journal of Neuroscience",
    doi: "10.1111/ejn.14293",
    url: "https://doi.org/10.1111/ejn.14293",
  },
  {
    id: "eastman-burgess-2009",
    source: "verified-fallback",
    title: "How To Travel the World Without Jet Lag (Eastman & Burgess, 2009)",
    year: 2009,
    venue: "Sleep Medicine Clinics, 4(2), 241–255",
    doi: "10.1016/j.jsmc.2009.02.006",
    url: "https://doi.org/10.1016/j.jsmc.2009.02.006",
  },
  {
    id: "eastman-2005",
    source: "verified-fallback",
    title:
      "Advancing circadian rhythms before eastward flight: a strategy to prevent or reduce jet lag (Eastman et al., 2005)",
    year: 2005,
    venue: "Sleep, 28(1), 33–44",
    doi: "10.1093/sleep/28.1.33",
    url: "https://doi.org/10.1093/sleep/28.1.33",
  },
  {
    id: "bin-2019",
    source: "verified-fallback",
    title:
      "What works for jet lag? A systematic review of non-pharmacological interventions (Bin, Postnova & Cistulli, 2019)",
    year: 2019,
    venue: "Sleep Medicine Reviews, 43, 47–59",
    doi: "10.1016/j.smrv.2018.09.005",
    url: "https://doi.org/10.1016/j.smrv.2018.09.005",
  },
  {
    id: "aasm-guideline-2015",
    source: "verified-fallback",
    title:
      "Clinical Practice Guideline for the Treatment of Intrinsic Circadian Rhythm Sleep-Wake Disorders (Auger et al., 2015; AASM)",
    year: 2015,
    venue: "Journal of Clinical Sleep Medicine, 11(10), 1199–1236",
    doi: "10.5664/jcsm.5100",
    url: "https://doi.org/10.5664/jcsm.5100",
  },
];

const BY_ID = new Map(CITATION_CATALOGUE.map((c) => [c.id, c]));

/** Look up one catalogue entry by id. */
export function citationById(id: string): Citation | undefined {
  return BY_ID.get(id);
}

/** Resolve ids to catalogue entries, dropping any that do not exist.
 *  Unknown ids are dropped rather than rendered as a broken citation: an id
 *  that is not in the catalogue is a hallucinated reference, and the scorer's
 *  UNKNOWN_CITATION gate exists to catch exactly that. */
export function resolveCitations(ids: string[]): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const c = BY_ID.get(id);
    if (!c || seen.has(id)) continue;
    seen.add(id);
    out.push(c);
  }
  return out;
}

/** The subset the replay provider cites by index. Kept as its own function so
 *  the replay transcript stays byte-identical when the catalogue grows. */
export function replayCitationSet(): Citation[] {
  return CITATION_CATALOGUE.slice(0, 4);
}
