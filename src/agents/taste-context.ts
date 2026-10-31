import { buildTasteItinerary } from "@/domain/taste-itinerary";
import type { TasteContext, TasteEntity } from "@/domain/taste";
import type { CalendarEvent, CrewEvent, Trip } from "@/domain/types";
import { destinationTaste, qlooEnabled } from "@/tools/qloo";

export async function loadTasteContext(trip: Trip, favorites: TasteEntity[]): Promise<TasteContext> {
  const snapshot = favorites.map((f) => ({ ...f }));
  if (!qlooEnabled()) return { favorites: snapshot, status: "unavailable", places: [] };
  try {
    const out = await destinationTaste(
      trip.destination.name,
      trip.destination.lon,
      trip.destination.lat,
      snapshot.map((f) => f.id),
    );
    const qualified = out.places.filter((p) => p.daytimeCandidate === true);
    return { favorites: snapshot, status: qualified.length ? "ready" : "no-matches", places: qualified };
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
