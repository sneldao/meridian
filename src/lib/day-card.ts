import { fmtMin } from "@/domain/circadian";
import type { DaySceneModel } from "@/domain/day-scene";
import type { TasteEntity } from "@/domain/taste";
import type { ResolvedPlaceChoice } from "@/lib/place-choices";
import { SAMPLE_TASTE_LABEL } from "@/lib/sample-taste";

export interface DayCardOptions {
  includeSchedule: boolean;
  includeEvent: boolean;
  includeBodyTime: boolean;
  includeTaste: boolean;
}

export interface DayCardSnapshot {
  city: string;
  date: string;
  fictionalTrip: boolean;
  eventIsExample: boolean;
  baselineIsExample: boolean;
  planState: "unavailable" | "preview" | "planned";
  moment: { title: string; localMin: number; bodyMin: number } | null;
  light: { label: string; startMin: number; endMin: number; continuesBefore: boolean; continuesAfter: boolean; fromEarlierDay: boolean }[];
  favorites: string[];
  place: { name: string; startMin: number; endMin: number; kept: boolean } | null;
  recordedTaste: boolean;
  staleTaste: boolean;
}

export interface DayCardSection {
  eyebrow: string;
  title: string;
  lines: string[];
}

export interface PublicDayCard {
  city: string;
  dateLabel?: string;
  status: string;
  sections: [DayCardSection, DayCardSection, DayCardSection];
  notices: string[];
}

export function snapshotDayCard(
  scene: DaySceneModel,
  input: {
    fictionalTrip?: boolean;
    eventSource?: "google" | "fixture";
    exampleBaseline?: boolean;
    preview?: boolean;
    idea?: ResolvedPlaceChoice;
    favorites?: TasteEntity[];
    recordedTaste?: boolean;
    staleTaste?: boolean;
  } = {},
): DayCardSnapshot {
  const moment = scene.momentDayIndex === scene.dayIndex ? scene.moment : null;
  const idea = input.idea?.suggestion.date === scene.date &&
    (input.idea.status === "kept" || input.idea.status === "suggested")
    ? input.idea : null;
  return {
    city: scene.city.name,
    date: scene.date,
    fictionalTrip: input.fictionalTrip === true,
    eventIsExample: input.eventSource !== "google",
    baselineIsExample: input.exampleBaseline === true,
    planState: !scene.plan ? "unavailable" : input.preview ? "preview" : "planned",
    moment: moment ? { title: moment.title, localMin: moment.localMin, bodyMin: moment.bodyMin } : null,
    light: scene.windows.filter((window) => window.kind !== "sleep").map((window) => ({
      label: window.label,
      startMin: window.startMin,
      endMin: window.endMin,
      continuesBefore: window.continuesBefore,
      continuesAfter: window.continuesAfter,
      fromEarlierDay: window.fromEarlierDay,
    })),
    favorites: (input.favorites ?? []).map((favorite) => favorite.name),
    place: idea ? {
      name: idea.place.name,
      startMin: idea.suggestion.startMin,
      endMin: idea.suggestion.endMin,
      kept: idea.status === "kept",
    } : null,
    recordedTaste: input.recordedTaste === true,
    staleTaste: input.staleTaste === true,
  };
}

export function defaultDayCardOptions(snapshot: DayCardSnapshot): DayCardOptions {
  const enabled = snapshot.fictionalTrip;
  return { includeSchedule: enabled, includeEvent: enabled, includeBodyTime: enabled, includeTaste: enabled };
}

export function publicDayCard(snapshot: DayCardSnapshot, options: DayCardOptions): PublicDayCard {
  const event = snapshot.moment;
  const eventLines: string[] = [];
  if (options.includeEvent && event) eventLines.push(`${fmtMin(event.localMin)} ${snapshot.city} local time`);
  if (options.includeBodyTime && event) eventLines.push(`${fmtMin(event.bodyMin)} estimated body time at the event`);
  if (!eventLines.length) eventLines.push("Light and rest, planned around what matters.");
  const lightLines = options.includeSchedule
    ? snapshot.light.map((window) =>
      `${window.label} ${fmtMin(window.startMin)}–${window.endMin === 1440 ? "24:00" : fmtMin(window.endMin)}` +
      (window.fromEarlierDay ? " · from an earlier day" : "") +
      (window.continuesAfter ? " · continues tomorrow" : ""),
    )
    : ["Right light. Right time. Not more sun."];
  const place = options.includeTaste ? snapshot.place : null;
  const tasteLines: string[] = [];
  if (options.includeTaste && snapshot.favorites.length) {
    tasteLines.push(`${snapshot.fictionalTrip ? "Sample favorites" : "Chosen favorites"}: ${snapshot.favorites.join(", ")}`);
  }
  if (place) {
    tasteLines.push(place.kept ? "Kept idea · not booked" : "Optional idea · not booked");
    if (options.includeSchedule) tasteLines.push(`${fmtMin(place.startMin)}–${fmtMin(place.endMin)} local time`);
  }
  if (!tasteLines.length) tasteLines.push("Make room for something that feels like you.");
  const notices = ["Planned, not a record of completed steps."];
  if (snapshot.fictionalTrip) notices.push("Fictional demo. Not actual personal data or an endorsement.");
  if (event && (options.includeEvent || options.includeBodyTime) && snapshot.eventIsExample) notices.push("Example calendar event.");
  if (event && options.includeBodyTime) {
    notices.push("Body-clock estimate from pre-event planned shifts, not measured alertness.");
    if (snapshot.baselineIsExample || snapshot.fictionalTrip) notices.push("Example sleep profile.");
  }
  if (place) {
    notices.push(snapshot.recordedTaste ? SAMPLE_TASTE_LABEL : "Qloo-ranked place idea.");
    notices.push("Opening hours, travel time and accessibility unverified.");
  }
  if (options.includeTaste && snapshot.staleTaste) notices.push("Favorites have changed; this is the earlier recommendation snapshot.");
  return {
    city: snapshot.city,
    ...(options.includeSchedule ? { dateLabel: snapshot.date } : {}),
    status: snapshot.planState === "unavailable" ? "No verified plan for this day" :
      snapshot.planState === "preview" ? "Plan preview" : "Planned day",
    sections: [
      { eyebrow: "01 · The moment", title: options.includeEvent && event ? event.title : "Show up for what matters.", lines: eventLines },
      { eyebrow: "02 · The light", title: "In the right light.", lines: lightLines.length ? lightLines : ["No timed light windows available for this day."] },
      { eyebrow: "03 · Your kind of day", title: place?.name ?? "Something to look forward to.", lines: tasteLines },
    ],
    notices,
  };
}
