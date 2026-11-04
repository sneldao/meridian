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
  /** The landing entry's pill name for this crate. */
  crateLabel: string;
  /** The route the crate's story flies — offered as a one-tap fill in the
   *  entry when the traveller hasn't typed one yet. */
  sampleRoute: { origin: string; dest: string };
  favorites: TasteEntity[];
  places: DestinationPlace[];
}

const KNOWN_KEYS = ["bjork", "luke", "diego"] as const;

export function sampleTasteProfile(key: string): SampleTasteProfile | null {
  const p = (snapshot.profiles as unknown[]).find(
    (x) => !!x && typeof x === "object" && (x as { key?: unknown }).key === key,
  ) as
    | { key?: string; city?: unknown; source?: unknown; crateLabel?: unknown; sampleRoute?: unknown; favorites?: unknown; places?: unknown }
    | undefined;
  if (!p) return null;
  const favorites = parseTasteFavorites(JSON.stringify(p.favorites ?? []));
  const places = (Array.isArray(p.places) ? p.places : []).filter(isDestinationPlace).filter((x) => x.daytimeCandidate !== false);
  if (!favorites || favorites.length === 0) return null;
  if (!KNOWN_KEYS.includes(p.key as (typeof KNOWN_KEYS)[number])) return null;
  const route = p.sampleRoute as { origin?: unknown; dest?: unknown } | undefined;
  return {
    key: p.key as SampleTasteProfile["key"],
    city: typeof p.city === "string" && p.city ? p.city : "",
    source: p.source === "imagined" ? "imagined" : "recorded",
    crateLabel:
      typeof p.crateLabel === "string" && p.crateLabel
        ? p.crateLabel
        : favorites[0].name,
    sampleRoute: {
      origin: typeof route?.origin === "string" && /^[A-Z]{3}$/.test(route.origin) ? route.origin : "LHR",
      dest: typeof route?.dest === "string" && /^[A-Z]{3}$/.test(route.dest) ? route.dest : "HND",
    },
    favorites,
    places,
  };
}

/** The crates the landing entry offers as one-tap seeds, in story order:
 *  Diego's dispatch first — the film sends viewers to the landing, and his
 *  crate is the WHAT half of that promise. */
export const SAMPLE_TASTE_CRATES: readonly SampleTasteProfile[] = ["diego", "bjork", "luke"]
  .map(sampleTasteProfile)
  .filter((p): p is SampleTasteProfile => p !== null);

/** The provenance line for a profile — recorded samples name the capture,
 *  imagined ones say plainly that they were written for the story. Both
 *  end on the same honesty: none of this is a live lookup. */
export function sampleTasteLabel(profile: SampleTasteProfile | null | undefined): string {
  return sampleSourceLabel(profile?.source ?? "recorded");
}

/** The provenance line by source alone — for surfaces (the live Today
 *  card, the day view's idea row) that carry the mark but not the profile.
 *  Named once here so every surface says the same true thing. */
export function sampleSourceLabel(source: SampleTasteSource): string {
  if (source === "imagined") {
    return "Imagined sample for this story — not a live lookup";
  }
  return `${SAMPLE_TASTE_LABEL} · not a live lookup`;
}

/** The provenance prefix for the card's signals line — Qloo when the picks
 *  came from a live lookup, the sample's own name when they didn't. */
export function tasteSignalsLabel(source?: SampleTasteSource): string {
  if (source === "imagined") return "Imagined sample signals: ";
  if (source === "recorded") return "Recorded sample signals: ";
  return "Qloo taste signals: ";
}

/** The day view's idea-row label, honest about where the place came from. */
export function ideaSourceLabel(source?: SampleTasteSource): string {
  if (source === "imagined") return "Imagined sample idea · optional";
  if (source === "recorded") return "Recorded sample idea · optional";
  return "Qloo place idea · optional";
}

/** Split a profile's places the way the live Qloo path does: daytime
 *  candidates compete for the plan's free hours, evening candidates are
 *  offered as the first night, never fitted. Evening-only venues lead the
 *  evening list so a place already fitting by day doesn't also claim the
 *  night. */
export function splitSamplePlaces(places: DestinationPlace[]): {
  daytime: DestinationPlace[];
  evening: DestinationPlace[];
} {
  const daytime = places.filter((p) => p.daytimeCandidate === true);
  const eveningAll = places.filter((p) => p.eveningCandidate === true);
  const evening = [
    ...eveningAll.filter((p) => p.daytimeCandidate !== true),
    ...eveningAll.filter((p) => p.daytimeCandidate === true),
  ].slice(0, 3);
  return { daytime, evening };
}

/** The sample profile whose crate a traveller packed, when the trip is
 *  headed for the profile's city — the replay fallback in loadTasteContext
 *  uses it to answer a seeded crate without a Qloo key. Matches when every
 *  favourite the crate carries is present in the trip's favourites, so a
 *  crate packed at the door is recognised even after the traveller adds
 *  their own names to it. */
export function matchSampleProfileForTrip(
  city: string,
  favorites: TasteEntity[],
): SampleTasteProfile | null {
  const ids = new Set(favorites.map((f) => f.id).filter(Boolean));
  for (const p of sampleTasteProfilesForCity(city)) {
    if (p.favorites.length > 0 && p.favorites.every((f) => ids.has(f.id))) return p;
  }
  return null;
}

/** The sample profiles whose places belong to a city — the /demo taste
 *  toggle offers exactly these, so a Mexico City journey never fits Tokyo
 *  venues into its free hours (and vice versa). */
export function sampleTasteProfilesForCity(city: string): SampleTasteProfile[] {
  return KNOWN_KEYS.map(sampleTasteProfile).filter(
    (p): p is SampleTasteProfile => p !== null && p.city === city,
  );
}
