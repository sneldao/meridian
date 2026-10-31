import {
  isDestinationPlace,
  parseTasteFavorites,
  type DestinationPlace,
  type TasteEntity,
} from "@/domain/taste";
import snapshot from "@/data/sample-taste.json";

export const SAMPLE_TASTE_LABEL = "Recorded Qloo sample · captured 31 Oct 2026";

export interface SampleTasteProfile {
  key: "bjork" | "luke";
  favorites: TasteEntity[];
  places: DestinationPlace[];
}

export function sampleTasteProfile(key: string): SampleTasteProfile | null {
  const p = (snapshot.profiles as unknown[]).find(
    (x) => !!x && typeof x === "object" && (x as { key?: unknown }).key === key,
  ) as { key?: string; favorites?: unknown; places?: unknown } | undefined;
  if (!p) return null;
  const favorites = parseTasteFavorites(JSON.stringify(p.favorites ?? []));
  const places = (Array.isArray(p.places) ? p.places : []).filter(isDestinationPlace).filter((x) => x.daytimeCandidate !== false);
  if (!favorites || favorites.length === 0) return null;
  if (p.key !== "bjork" && p.key !== "luke") return null;
  return { key: p.key, favorites, places };
}
