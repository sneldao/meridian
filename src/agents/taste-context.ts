import { buildTasteItinerary } from "@/domain/taste-itinerary";
import { tasteHistory } from "@/domain/graph-memory";
import { withoutDismissed, type TasteContext, type TasteEntity } from "@/domain/taste";
import type { CalendarEvent, CrewEvent, Trip } from "@/domain/types";
import { destinationTaste, qlooEnabled } from "@/tools/qloo";

export async function loadTasteContext(trip: Trip, favorites: TasteEntity[], tenant?: string): Promise<TasteContext> {
  const snapshot = favorites.map((f) => ({ ...f }));
  if (!qlooEnabled()) return { favorites: snapshot, status: "unavailable", places: [] };
  try {
    /* The remembered traveller: kept places from past trips feed the
     * affinity signal alongside the declared favourites, dismissed places
     * are suppressed outright. No graph → empty history → same behaviour. */
    const history = await tasteHistory(tenant);
    const interests = [...new Set([...snapshot.map((f) => f.id), ...history.keptIds])].slice(0, 8);
    const out = await destinationTaste(
      trip.destination.name,
      trip.destination.lon,
      trip.destination.lat,
      interests,
    );
    const kept = withoutDismissed(out.places, history.dismissed);
    const qualified = kept.filter((p) => p.daytimeCandidate === true);
    const evening = kept.filter((p) => p.eveningCandidate === true).slice(0, 3);
    const suppressed = out.places.length - kept.length;
    return {
      favorites: snapshot,
      status: qualified.length ? "ready" : "no-matches",
      places: qualified,
      ...(evening.length ? { eveningPlaces: evening } : {}),
      ...(history.keptIds.length || suppressed
        ? { memory: { kept: history.keptIds.length, suppressed } }
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
