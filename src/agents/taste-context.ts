import { buildTasteItinerary } from "@/domain/taste-itinerary";
import { tasteHistory } from "@/domain/graph-memory";
import { placeKey, withoutDismissed, type TasteContext, type TasteEntity, type TasteMarks } from "@/domain/taste";
import type { CalendarEvent, CrewEvent, Trip } from "@/domain/types";
import { likedCategories, rankByAdjacency } from "@/lib/place-choices";
import { matchSampleProfileForTrip, splitSamplePlaces } from "@/lib/sample-taste";
import { destinationTaste, qlooEnabled } from "@/tools/qloo";

/** Evening candidates, evening-only venues first — a place that also fits
 *  by day shouldn't claim the first night when a purely evening venue is
 *  available. The same ordering the sample split uses. */
function orderEvening(evening: ReturnType<typeof withoutDismissed>): ReturnType<typeof withoutDismissed> {
  return [
    ...evening.filter((p) => p.daytimeCandidate !== true),
    ...evening.filter((p) => p.daytimeCandidate === true),
  ].slice(0, 3);
}

/* The resolver ladder (agent-native §4b): live → recorded → imagined →
 * unavailable, one resolver, each tier carrying its own provenance. A live
 * failure falls *down* the ladder instead of dead-ending — a crate packed
 * at the door still gets a recorded answer, stamped as recorded, never
 * dressed as a live lookup. Memory reads once and shapes every rung:
 * kept ids feed the live affinity signal and re-rank a recorded pool by
 * the same session adjacency the swap list uses; dismissed places are
 * suppressed on either lane. */
export async function loadTasteContext(trip: Trip, favorites: TasteEntity[], tenant?: string, marks?: TasteMarks): Promise<TasteContext> {
  const snapshot = favorites.map((f) => ({ ...f }));
  /* The remembered traveller: memory is unioned from two sources — the
   * device's own marks (local-first, needs nothing) and graph history
   * (cross-device, empty when FalkorDB is off). Neither configured →
   * same behaviour. */
  const history = await tasteHistory(tenant);
  const keptIds = [...new Set([...history.keptIds, ...(marks?.kept ?? [])])];
  const dismissed = [...history.dismissed];
  const seenDismissed = new Set(dismissed.map((d) => d.id ?? d.name.trim().toLowerCase()));
  for (const d of marks?.dismissed ?? []) {
    const k = d.id ?? d.name.trim().toLowerCase();
    if (!seenDismissed.has(k)) {
      seenDismissed.add(k);
      dismissed.push(d);
    }
  }
  const memoryFor = (suppressed: number): Pick<TasteContext, "memory"> =>
    keptIds.length || suppressed
      ? { memory: { kept: keptIds.length, suppressed, keptIds } }
      : {};

  let liveUnavailable = false;
  if (qlooEnabled()) {
    try {
      /* Kept places feed the affinity signal alongside the declared
       * favourites; dismissed places are suppressed outright. */
      const interests = [...new Set([...snapshot.map((f) => f.id), ...keptIds])].slice(0, 8);
      const out = await destinationTaste(
        trip.destination.name,
        trip.destination.lon,
        trip.destination.lat,
        interests,
      );
      const kept = withoutDismissed(out.places, dismissed);
      const qualified = kept.filter((p) => p.daytimeCandidate === true);
      const evening = orderEvening(kept.filter((p) => p.eveningCandidate === true));
      const suppressed = out.places.length - kept.length;
      return {
        favorites: snapshot,
        status: qualified.length ? "ready" : "no-matches",
        tier: "live",
        places: qualified,
        ...(evening.length ? { eveningPlaces: evening } : {}),
        ...memoryFor(suppressed),
      };
    } catch {
      /* Fall down the ladder — the recorded pool still answers. The
       * context flags the fall so surfaces can name it. */
      liveUnavailable = true;
    }
  }
  /* No key, or the live rung failed — a crate packed at the door still
   * deserves an answer. When the favourites carry one of the bundled
   * sample crates and the trip is headed for that crate's city, fit the
   * recorded places instead of showing an empty "unavailable". */
  const sample = matchSampleProfileForTrip(trip.destination.name, snapshot);
  if (sample) {
    /* The same shaping the live lane gets: dismissed places suppressed,
     * then the recorded pool re-ranked by adjacency to what the
     * traveller kept — replay mode visibly learns, and the memory tally
     * names it identically. */
    const pool = withoutDismissed(sample.places, dismissed);
    const suppressed = sample.places.length - pool.length;
    const liked = likedCategories(
      pool.filter((p) => keptIds.includes(placeKey(p))),
    );
    const { daytime, evening } = splitSamplePlaces(rankByAdjacency(pool, liked));
    return {
      favorites: snapshot,
      status: daytime.length ? "ready" : "no-matches",
      tier: sample.source,
      places: daytime,
      ...(evening.length ? { eveningPlaces: evening } : {}),
      sampleSource: sample.source,
      ...(liveUnavailable ? { liveUnavailable: true } : {}),
      ...memoryFor(suppressed),
    };
  }
  return {
    favorites: snapshot,
    status: "unavailable",
    tier: "unavailable",
    places: [],
    ...(liveUnavailable ? { liveUnavailable: true } : {}),
  };
}

export async function* withTasteItinerary(
  events: AsyncGenerator<CrewEvent>,
  context: Promise<TasteContext>,
): AsyncGenerator<CrewEvent> {
  let trip: Trip | null = null;
  let calendar: CalendarEvent[] | null = null;
  for await (const event of events) {
    if (event.type === "run_start") {
      trip = event.trip;
      calendar = event.calendar.map((e) => ({ ...e }));
      yield event;
      continue;
    }
    if (event.type === "calendar_move" && calendar) {
      const target = calendar.find((e) => e.id === event.move.eventId);
      if (target) target.movedTo = { ...event.move.to };
      yield event;
      continue;
    }
    if (event.type === "briefing" && trip && calendar) {
      const ctx = await context;
      yield { ...event, tasteItinerary: buildTasteItinerary(trip, event.days, calendar, ctx, "replay") };
      continue;
    }
    yield event;
  }
}
