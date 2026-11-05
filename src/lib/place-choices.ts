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

/** Mirror a verdict to the graph so future trips remember it —
 *  fire-and-forget; the local choice is the durable copy. */
export function postTasteSignal(
  status: PlaceChoice["status"],
  place: DestinationPlace,
): void {
  try {
    void fetch("/api/taste/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        place: { ...(place.id ? { id: place.id } : {}), name: place.name },
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* no window / offline — the localStorage choice still stands */
  }
}

const choicesKey = (scope: string) => `meridian:place-choices:${scope}`;

/** The step-4 session signal: categories of the places the traveller kept
 *  or swapped in, normalized. Shared by the alternatives re-rank below and
 *  the taste ladder's sample lane (`loadTasteContext`), so kept marks
 *  order a recorded pool by the same adjacency as a session's picks. */
export function likedCategories(places: Iterable<DestinationPlace>): Set<string> {
  const liked = new Set<string>();
  for (const p of places) {
    for (const cat of p.categories) {
      const n = cat.trim().toLowerCase();
      if (n) liked.add(n);
    }
  }
  return liked;
}

/** Step-4 ordering: places adjacent to the liked categories list first;
 *  the pool's own order survives inside each adjacency tier — a stable
 *  sort, never a reshuffle. */
export function rankByAdjacency(
  pool: DestinationPlace[],
  liked: ReadonlySet<string>,
): DestinationPlace[] {
  if (!liked.size) return pool;
  const adjacency = (p: DestinationPlace) =>
    p.categories.filter((cat) => liked.has(cat.trim().toLowerCase())).length;
  return [...pool].sort((a, b) => adjacency(b) - adjacency(a));
}

/** The day's pinned idea — `resolvePlaceChoice` on whatever suggestion the
 *  itinerary gives that dayIndex, null when it has none. The feed pins it
 *  on the day card itself (agent-native step 4), so the match+resolve
 *  chain lives here exactly once. */
export function dayPlacePin(
  itinerary: TasteItinerary,
  dayIndex: number,
  state: PlaceChoiceState,
): ResolvedPlaceChoice | null {
  const suggestion = itinerary.suggestions.find((s) => s.dayIndex === dayIndex);
  return suggestion ? resolvePlaceChoice(itinerary, suggestion, state) : null;
}

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
  /* Session ranking (agent-native step 4): alternatives adjacent to what
   * the traveller already kept or swapped in — a shared category — list
   * first, so the next offer learns from this session's picks. The pool's
   * own order (the taste ranking) survives inside each adjacency tier:
   * a stable sort, never a reshuffle. The same ordering ranks the sample
   * lane of the taste ladder via rankByAdjacency. */
  const liked = likedCategories(
    Object.values(state)
      .filter((c) => c.tasteKey === key && (c.status === "kept" || c.status === "swapped"))
      .map((c) => c.place),
  );
  return {
    ...resolved,
    alternatives: rankByAdjacency(
      pool.filter((p, index) =>
        placeKey(p) !== placeKey(resolved.place) &&
        !reservedElsewhere.has(placeKey(p)) &&
        !originalsElsewhere.has(placeKey(p)) &&
        (choice?.status !== "swapped" || index > currentIndex)),
      liked,
    ),
  };
}
