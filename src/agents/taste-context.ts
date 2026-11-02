import { buildTasteItinerary } from "@/domain/taste-itinerary";
import { tasteHistory } from "@/domain/graph-memory";
import { withoutDismissed, type TasteContext, type TasteEntity, type TasteMarks } from "@/domain/taste";
import type { CalendarEvent, CrewEvent, Trip } from "@/domain/types";
import { destinationTaste, qlooEnabled } from "@/tools/qloo";

export async function loadTasteContext(trip: Trip, favorites: TasteEntity[], tenant?: string, marks?: TasteMarks): Promise<TasteContext> {
  const snapshot = favorites.map((f) => ({ ...f }));
  if (!qlooEnabled()) return { favorites: snapshot, status: "unavailable", places: [] };
  try {
    /* The remembered traveller: kept places feed the affinity signal
     * alongside the declared favourites, dismissed places are suppressed
     * outright. Memory is unioned from two sources — the device's own
     * marks (local-first, needs nothing) and graph history (cross-device,
     * empty when FalkorDB is off). Neither configured → same behaviour. */
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
    const interests = [...new Set([...snapshot.map((f) => f.id), ...keptIds])].slice(0, 8);
    const out = await destinationTaste(
      trip.destination.name,
      trip.destination.lon,
      trip.destination.lat,
      interests,
    );
    const kept = withoutDismissed(out.places, dismissed);
    const qualified = kept.filter((p) => p.daytimeCandidate === true);
    const evening = kept.filter((p) => p.eveningCandidate === true).slice(0, 3);
    const suppressed = out.places.length - kept.length;
    return {
      favorites: snapshot,
      status: qualified.length ? "ready" : "no-matches",
      places: qualified,
      ...(evening.length ? { eveningPlaces: evening } : {}),
      ...(keptIds.length || suppressed
        ? { memory: { kept: keptIds.length, suppressed, keptIds } }
        : {}),
    };
  } catch {
    return { favorites: snapshot, status: "unavailable", places: [] };
  }
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
