import type { Trip } from "@/domain/types";

export const TASTE_TYPES = { artist: 'Music', movie: 'Film', book: 'Books', brand: 'Brands' } as const;
export type TasteType = keyof typeof TASTE_TYPES;
export interface TasteEntity { id: string; name: string; type: TasteType }
export interface DestinationPlace { id?: string; name: string; categories: string[]; daytimeCandidate?: boolean }
export interface TasteResponse { enabled: boolean; destination: string | null; places: DestinationPlace[]; note?: string }
export function isTasteType(value: string): value is TasteType { return Object.hasOwn(TASTE_TYPES, value); }
export function tasteSelectionKey(entities: TasteEntity[]): string { return entities.map(e => e.id).sort().join(','); }
export function addTasteEntity(entities: TasteEntity[], entity: TasteEntity): TasteEntity[] {
  return entities.length >= 3 || entities.some(e => e.id === entity.id) ? entities : [...entities, entity];
}
export function placeSearchUrl(name: string, destination: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${destination}`)}`;
}
export const TASTE_ID_RE = /^[a-zA-Z0-9:_-]{1,128}$/;
export function isDestinationPlace(p: unknown): p is DestinationPlace {
  if (!p || typeof p !== "object") return false;
  const o = p as { id?: unknown; name?: unknown; categories?: unknown; daytimeCandidate?: unknown };
  if (typeof o.name !== "string" || !o.name.trim() || o.name.length > 300) return false;
  if (o.id !== undefined && (typeof o.id !== "string" || !TASTE_ID_RE.test(o.id))) return false;
  if (o.daytimeCandidate !== undefined && typeof o.daytimeCandidate !== "boolean") return false;
  return Array.isArray(o.categories) && o.categories.length <= 5 && o.categories.every((c) => typeof c === "string" && c.length <= 120);
}

export function isTasteResponse(d: unknown): d is TasteResponse {
  if (!d || typeof d !== "object") return false;
  const o = d as { enabled?: unknown; destination?: unknown; places?: unknown; note?: unknown };
  if (typeof o.enabled !== "boolean") return false;
  if (!(typeof o.destination === "string" || o.destination === null)) return false;
  if (!Array.isArray(o.places)) return false;
  if (o.note !== undefined && typeof o.note !== "string") return false;
  return o.places.every(isDestinationPlace);
}
export function isTasteEntitiesResponse(d: unknown): d is { enabled: boolean; entities: TasteEntity[] } {
  if (!d || typeof d !== "object") return false;
  const o = d as { enabled?: unknown; entities?: unknown };
  if (typeof o.enabled !== "boolean" || !Array.isArray(o.entities)) return false;
  return o.entities.every(
    (e) =>
      !!e &&
      typeof e === "object" &&
      typeof (e as { id?: unknown }).id === "string" &&
      TASTE_ID_RE.test((e as { id: string }).id) &&
      typeof (e as { name?: unknown }).name === "string" &&
      (e as { name: string }).name.trim().length > 0 &&
      (e as { name: string }).name.trim().length <= 100,
  );
}

export interface TasteContext {
  favorites: TasteEntity[];
  status: "ready" | "unavailable" | "no-matches";
  places: DestinationPlace[];
}
export interface TasteItinerary {
  destinationCode: string;
  destination: string;
  departureDate: string;
  favorites: TasteEntity[];
  status: "ready" | "unavailable" | "no-matches" | "no-window";
  planningMode: "live" | "replay";
  suggestions: {
    dayIndex: number;
    date: string;
    label: string;
    startMin: number;
    endMin: number;
    place: DestinationPlace;
  }[];
  alternatives?: DestinationPlace[];
}
export function parseTasteFavorites(raw: string | null): TasteEntity[] | null {
  if (raw === null) return [];
  if (raw.length > 4096) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 3) return null;
    const out: TasteEntity[] = [];
    for (const e of value) {
      if (
        !e ||
        typeof e !== "object" ||
        typeof e.id !== "string" ||
        !TASTE_ID_RE.test(e.id) ||
        typeof e.name !== "string" ||
        !e.name.trim() ||
        e.name.trim().length > 100 ||
        typeof e.type !== "string" ||
        !isTasteType(e.type)
      ) return null;
      if (!out.some((x) => x.id === e.id)) out.push({ id: e.id, name: e.name.trim(), type: e.type });
    }
    return out;
  } catch {
    return null;
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isRealDate(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10) === v;
}

export function isTasteItinerary(value: unknown): value is TasteItinerary {
  if (!value || typeof value !== "object") return false;
  const o = value as Partial<TasteItinerary>;
  if (typeof o.destinationCode !== "string" || !o.destinationCode || o.destinationCode.length > 10) return false;
  if (typeof o.destination !== "string" || !o.destination.trim() || o.destination.length > 120) return false;
  if (typeof o.departureDate !== "string" || !isRealDate(o.departureDate)) return false;
  if (!Array.isArray(o.favorites) || o.favorites.length < 1 || o.favorites.length > 3) return false;
  if (parseTasteFavorites(JSON.stringify(o.favorites)) === null) return false;
  if (!["ready", "unavailable", "no-matches", "no-window"].includes(o.status as string)) return false;
  if (!["live", "replay"].includes(o.planningMode as string)) return false;
  if (!Array.isArray(o.suggestions) || o.suggestions.length > 3) return false;
  if (new Set(o.suggestions.map((s) => (s as { dayIndex?: unknown })?.dayIndex)).size !== o.suggestions.length) return false;
  for (const s of o.suggestions) {
    if (!s || typeof s !== "object") return false;
    if (!Number.isInteger(s.dayIndex) || s.dayIndex < 0) return false;
    if (typeof s.date !== "string" || !isRealDate(s.date)) return false;
    if (typeof s.label !== "string" || !s.label) return false;
    if (!Number.isInteger(s.startMin) || !Number.isInteger(s.endMin)) return false;
    if (s.startMin < 0 || s.startMin >= s.endMin || s.endMin > 1440 || s.endMin - s.startMin < 60) return false;
    const p = s.place;
    if (!isDestinationPlace(p)) return false;
  }
  if (o.alternatives !== undefined) {
    if (!Array.isArray(o.alternatives) || o.alternatives.length > 10) return false;
    if (!o.alternatives.every(isDestinationPlace)) return false;
  }
  if (o.status === "ready" && o.suggestions.length === 0) return false;
  if (o.status !== "ready" && o.suggestions.length !== 0) return false;
  return true;
}

export const placeKey = (p: DestinationPlace): string => p.id ?? p.name.trim().toLocaleLowerCase("en");

export type TasteTripContext = Pick<Trip, "days" | "departureDayIndex"> & {
  destination: Pick<Trip["destination"], "code">;
};
export function itineraryMatchesTrip(itinerary: TasteItinerary, trip: TasteTripContext): boolean {
  if (!trip || typeof trip !== "object" || !trip.destination || typeof trip.destination !== "object" || typeof trip.destination.code !== "string" || !Array.isArray(trip.days) || !Number.isInteger(trip.departureDayIndex)) return false;
  if (trip.days.some((d) => !d || typeof d !== "object" || !Number.isInteger(d.dayIndex) || typeof d.date !== "string" || typeof d.label !== "string")) return false;
  if (itinerary.destinationCode !== trip.destination.code) return false;
  if (itinerary.departureDate !== trip.days.find((d) => d.dayIndex === trip.departureDayIndex)?.date) return false;
  for (const s of itinerary.suggestions) {
    const spec = trip.days.find((d) => d.dayIndex === s.dayIndex);
    if (!spec || spec.date !== s.date || spec.label !== s.label) return false;
    if (s.dayIndex <= trip.departureDayIndex) return false;
  }
  return true;
}
