import { effectiveCalendar } from "@/domain/circadian";
import type { DestinationPlace, TasteContext, TasteItinerary } from "@/domain/taste";
import type { CalendarEvent, DayPlan, Trip } from "@/domain/types";

export function buildTasteItinerary(
  trip: Trip,
  days: DayPlan[],
  calendar: CalendarEvent[],
  context: TasteContext,
  planningMode: "live" | "replay",
): TasteItinerary {
  const base = {
    destinationCode: trip.destination.code,
    destination: trip.destination.name,
    departureDate: trip.days.find((d) => d.dayIndex === trip.departureDayIndex)?.date ?? "",
    favorites: context.favorites,
    planningMode,
    suggestions: [] as TasteItinerary["suggestions"],
    alternatives: [] as DestinationPlace[],
  };
  if (context.status !== "ready") return { ...base, status: context.status };
  const suggestions: TasteItinerary["suggestions"] = [];
  const finalCalendar = effectiveCalendar(calendar);
  const seenDays = new Set<number>();
  for (const day of [...days].sort((a, b) => a.dayIndex - b.dayIndex)) {
    if (seenDays.has(day.dayIndex)) continue;
    seenDays.add(day.dayIndex);
    if (day.dayIndex <= trip.departureDayIndex || suggestions.length >= Math.min(3, context.places.length)) continue;
    const spec = trip.days.find((d) => d.dayIndex === day.dayIndex && d.label === day.label);
    if (!spec) continue;
    if (
      !Number.isInteger(day.targetWakeMin) || !Number.isInteger(day.targetBedtimeMin) ||
      day.targetWakeMin < 0 || day.targetWakeMin >= 1440 ||
      day.targetBedtimeMin < 0 || day.targetBedtimeMin >= 1440 ||
      day.targetBedtimeMin === day.targetWakeMin
    ) continue;
    const bed = day.targetBedtimeMin <= day.targetWakeMin ? day.targetBedtimeMin + 1440 : day.targetBedtimeMin;
    const low = Math.max(600, day.targetWakeMin + 60);
    const high = Math.min(1080, bed - 120);
    if (high - low < 60) continue;
    const blocks: [number, number][] = [];
    let invalid = false;
    for (const previous of days.filter((d) => d.dayIndex === day.dayIndex - 1 && d.dayIndex > trip.departureDayIndex)) {
      for (const iv of previous.interventions) {
        if (iv.kind === "caffeine_cutoff" || iv.kind === "melatonin") continue;
        const s = iv.startMin, rawEnd = iv.endMin ?? s + 30;
        if (!Number.isInteger(s) || !Number.isInteger(rawEnd) || s < 0 || s >= 1440 || rawEnd < 0 || rawEnd > 2880) { invalid = true; break; }
        const end = rawEnd <= s ? rawEnd + 1440 : rawEnd;
        if (end > 1440) blocks.push([0, end - 1440]);
      }
      if (invalid) break;
    }
    if (invalid) continue;
    for (const iv of day.interventions) {
      if (iv.kind === "caffeine_cutoff" || iv.kind === "melatonin") continue;
      const s = iv.startMin, e = iv.endMin ?? s + 30;
      if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || s >= 1440 || e < 0 || e > 2880) { invalid = true; break; }
      if (e <= s) { blocks.push([s, 1440], [0, e]); } else { blocks.push([s, Math.min(e, 1440)]); if (e > 1440) blocks.push([0, e - 1440]); }
    }
    if (invalid) continue;
    for (const event of finalCalendar) {
      if (event.blocksInterventions === false) continue;
      if (!Number.isInteger(event.dayIndex) || !Number.isInteger(event.startMin) || !Number.isInteger(event.endMin) || event.startMin < 0 || event.startMin >= 1440 || event.endMin < 0 || event.endMin > 2880) { invalid = true; break; }
      const s = event.dayIndex * 1440 + event.startMin;
      const e = event.dayIndex * 1440 + event.endMin + (event.endMin <= event.startMin ? 1440 : 0);
      blocks.push([s - day.dayIndex * 1440, e - day.dayIndex * 1440]);
    }
    if (invalid) continue;
    blocks.sort((a, b) => a[0] - b[0]);
    let cursor = low;
    for (const [s, e] of blocks) {
      if (e <= cursor || s >= high) continue;
      if (s - cursor >= 60) break;
      cursor = Math.max(cursor, e);
    }
    if (high - cursor < 60) continue;
    suggestions.push({
      dayIndex: day.dayIndex,
      date: spec.date,
      label: spec.label,
      startMin: cursor,
      endMin: cursor + 60,
      place: context.places[suggestions.length],
    });
  }
  return {
    ...base,
    status: suggestions.length ? "ready" : "no-window",
    suggestions,
    alternatives: context.places.slice(0, 10),
  };
}
