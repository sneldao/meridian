import {
  isDestinationPlace,
  parseTasteFavorites,
  type DestinationPlace,
  type TasteEntity,
} from "@/domain/taste";
import snapshot from "@/data/sample-taste.json";

export const SAMPLE_TASTE_LABEL = "Recorded Qloo sample · captured 31 Oct 2026";

/** How a sample profile came to exist. `recorded` = a real captured Qloo
 *  response; `imagined` = written for a fictional scenario, so its
 *  provenance line must say so wherever the label is shown. */
export type SampleTasteSource = "recorded" | "imagined";

export interface SampleTasteProfile {
  key: "bjork" | "luke" | "diego";
  /** The city the places belong to — a profile only makes sense fitted
   *  into a trip headed there. */
  city: string;
  source: SampleTasteSource;
  favorites: TasteEntity[];
  places: DestinationPlace[];
}

const KNOWN_KEYS = ["bjork", "luke", "diego"] as const;

export function sampleTasteProfile(key: string): SampleTasteProfile | null {
  const p = (snapshot.profiles as unknown[]).find(
    (x) => !!x && typeof x === "object" && (x as { key?: unknown }).key === key,
  ) as
    | { key?: string; city?: unknown; source?: unknown; favorites?: unknown; places?: unknown }
    | undefined;
  if (!p) return null;
  const favorites = parseTasteFavorites(JSON.stringify(p.favorites ?? []));
  const places = (Array.isArray(p.places) ? p.places : []).filter(isDestinationPlace).filter((x) => x.daytimeCandidate !== false);
  if (!favorites || favorites.length === 0) return null;
  if (!KNOWN_KEYS.includes(p.key as (typeof KNOWN_KEYS)[number])) return null;
  return {
    key: p.key as SampleTasteProfile["key"],
    city: typeof p.city === "string" && p.city ? p.city : "",
    source: p.source === "imagined" ? "imagined" : "recorded",
    favorites,
    places,
  };
}

/** The provenance line for a profile — recorded samples name the capture,
 *  imagined ones say plainly that they were written for the story. Both
 *  end on the same honesty: none of this is a live lookup. */
export function sampleTasteLabel(profile: SampleTasteProfile | null | undefined): string {
  if (profile?.source === "imagined") {
    return "Imagined sample for this story — not a live lookup";
  }
  return `${SAMPLE_TASTE_LABEL} · not a live lookup`;
}

/** The sample profiles whose places belong to a city — the /demo taste
 *  toggle offers exactly these, so a Mexico City journey never fits Tokyo
 *  venues into its free hours (and vice versa). */
export function sampleTasteProfilesForCity(city: string): SampleTasteProfile[] {
  return KNOWN_KEYS.map(sampleTasteProfile).filter(
    (p): p is SampleTasteProfile => p !== null && p.city === city,
  );
}
