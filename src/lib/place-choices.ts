import {
  isDestinationPlace,
  placeKey,
  tasteSelectionKey,
  type DestinationPlace,
  type TasteItinerary,
} from "@/domain/taste";

export interface PlaceChoice {
  status: "kept" | "dismissed" | "swapped";
  place: DestinationPlace;
  tasteKey: string;
}
export type PlaceChoiceState = Record<string, PlaceChoice>;

export interface ResolvedPlaceChoice {
  suggestion: TasteItinerary["suggestions"][number];
  place: DestinationPlace;
  status: "suggested" | "kept" | "dismissed" | "unavailable";
  alternatives: DestinationPlace[];
  savedPlace?: DestinationPlace;
  unavailableReason?: "missing" | "reserved";
  canRestore?: boolean;
}

const CHOICE_STATUSES = new Set(["kept", "dismissed", "swapped"]);
const MAX_ENTRIES = 50;
const MAX_SERIALIZED = 64_000;

function isRealDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === v;
}

export function isPlaceChoice(v: unknown): v is PlaceChoice {
  if (!v || typeof v !== "object") return false;
  const o = v as { status?: unknown; place?: unknown; tasteKey?: unknown };
  return (
    typeof o.status === "string" &&
    CHOICE_STATUSES.has(o.status) &&
    isDestinationPlace(o.place) &&
    typeof o.tasteKey === "string" &&
    o.tasteKey.length > 0 &&
    o.tasteKey.length <= 400
  );
}

export function parsePlaceChoices(raw: string | null): PlaceChoiceState {
  if (raw === null || raw.length > MAX_SERIALIZED) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_ENTRIES) return {};
    const out: PlaceChoiceState = {};
    for (const [date, c] of entries) {
      if (isRealDate(date) && isPlaceChoice(c)) out[date] = c;
    }
    return out;
  } catch {
    return {};
  }
}

const choicesKey = (scope: string) => `meridian:place-choices:${scope}`;

export function readPlaceChoices(storage: Pick<Storage, "getItem">, scope: string): PlaceChoiceState {
  return parsePlaceChoices(storage.getItem(choicesKey(scope)));
}

export function writePlaceChoices(
  storage: Pick<Storage, "setItem">,
  scope: string,
  state: PlaceChoiceState,
): void {
  const entries = Object.entries(state);
  if (entries.length > MAX_ENTRIES) throw new Error("too many place choices");
  for (const [date, c] of entries) {
    if (!isRealDate(date) || !isPlaceChoice(c)) throw new Error("invalid place choice");
  }
  const serialized = JSON.stringify(state);
  if (serialized.length > MAX_SERIALIZED) throw new Error("place choices too large");
  storage.setItem(choicesKey(scope), serialized);
}

export function resolvePlaceChoice(
  itinerary: TasteItinerary,
  suggestion: TasteItinerary["suggestions"][number],
  state: PlaceChoiceState,
): ResolvedPlaceChoice {
  const pool: DestinationPlace[] = [];
  const push = (p: DestinationPlace) => {
    if (p.daytimeCandidate === false) return;
    if (!pool.some((x) => placeKey(x) === placeKey(p))) pool.push(p);
  };
  for (const p of itinerary.alternatives ?? []) push(p);
  for (const s of itinerary.suggestions) push(s.place);

  const key = tasteSelectionKey(itinerary.favorites);
  const ordered = [...itinerary.suggestions].sort((a, b) => a.date.localeCompare(b.date));
  const allocations = new Map<string, ResolvedPlaceChoice>();
  const used = new Set<string>();
  const matched = (date: string) => state[date]?.tasteKey === key ? state[date] : undefined;
  const resultFor = (
    s: TasteItinerary["suggestions"][number],
    status: ResolvedPlaceChoice["status"],
    place = s.place,
  ): ResolvedPlaceChoice => ({ suggestion: s, place, status, alternatives: [] });

  for (const s of ordered) {
    const choice = matched(s.date);
    if (!choice) continue;
    if (choice.status === "dismissed") {
      allocations.set(s.date, { ...resultFor(s, "dismissed"), savedPlace: choice.place });
      continue;
    }
    const place = pool.find((p) => placeKey(p) === placeKey(choice.place));
    if (!place || used.has(placeKey(place))) {
      allocations.set(s.date, {
        ...resultFor(s, "unavailable"),
        savedPlace: choice.place,
        unavailableReason: place ? "reserved" : "missing",
      });
      continue;
    }
    used.add(placeKey(place));
    allocations.set(s.date, resultFor(s, choice.status === "kept" ? "kept" : "suggested", place));
  }

  for (const s of ordered) {
    if (allocations.has(s.date)) continue;
    const originalsElsewhere = new Set(
      ordered.filter((other) => other.date !== s.date && !allocations.has(other.date))
        .map((other) => placeKey(other.place)),
    );
    const place = pool.find((p) => placeKey(p) === placeKey(s.place) && !used.has(placeKey(p))) ??
      pool.find((p) => !used.has(placeKey(p)) && !originalsElsewhere.has(placeKey(p))) ??
      pool.find((p) => !used.has(placeKey(p)));
    if (!place) {
      allocations.set(s.date, { ...resultFor(s, "unavailable"), unavailableReason: "reserved", canRestore: false });
      continue;
    }
    used.add(placeKey(place));
    allocations.set(s.date, resultFor(s, "suggested", place));
  }

  const resolved = allocations.get(suggestion.date) ?? resultFor(suggestion, "unavailable");
  const choice = matched(suggestion.date);
  if (resolved.status === "unavailable") {
    if (!choice) return resolved;
    const cleared = { ...state };
    delete cleared[suggestion.date];
    return {
      ...resolved,
      canRestore: resolvePlaceChoice(itinerary, suggestion, cleared).status !== "unavailable",
    };
  }
  const reservedElsewhere = new Set(
    [...allocations.entries()]
      .filter(([date, r]) => date !== suggestion.date && (r.status === "kept" || r.status === "suggested"))
      .map(([, r]) => placeKey(r.place)),
  );
  const originalsElsewhere = new Set(
    ordered.filter((s) => s.date !== suggestion.date).map((s) => placeKey(s.place)),
  );
  const currentIndex = pool.findIndex((p) => placeKey(p) === placeKey(resolved.place));
  return {
    ...resolved,
    alternatives: pool.filter((p, index) =>
      placeKey(p) !== placeKey(resolved.place) &&
      !reservedElsewhere.has(placeKey(p)) &&
      !originalsElsewhere.has(placeKey(p)) &&
      (choice?.status !== "swapped" || index > currentIndex)),
  };
}
