import { remainingLagMin } from "@/domain/readiness";
import { performanceMoment } from "@/domain/trip-performance";
import { skyBand, skyGradient, SKY_BAND_LABEL } from "@/domain/sky";
import { solarZenithDeg, subsolarPoint } from "@/domain/sun";
import { utcOffsetMinAt } from "@/domain/timezones";
import type { CalendarEvent, City, DayPlan, Trip, WearableBaseline } from "@/domain/types";

const DAY = 86_400_000;
const MINUTE = 60_000;
const wrap = (minute: number) => ((minute % 1440) + 1440) % 1440;
const clampMinute = (minute: number) => Number.isFinite(minute) ? Math.max(0, Math.min(1439, Math.round(minute))) : 720;
const WINDOW_KINDS = {
  light_exposure: { kind: "seek", label: "Seek light" },
  avoid_light: { kind: "reduce", label: "Reduce light" },
  sleep_window: { kind: "sleep", label: "Sleep" },
} as const;

function dateStart(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date ? timestamp : null;
}

function offsetAt(city: City, timestamp: number): number {
  return city.tz ? utcOffsetMinAt(city.tz, new Date(timestamp)) : city.utcOffsetMin;
}

export function sceneWallInstant(city: City, date: string, minute: number): number | null {
  const midnight = dateStart(date);
  if (midnight === null || !Number.isFinite(minute)) return null;
  const wall = midnight + Math.round(minute) * MINUTE;
  try {
    const offsets = new Set([-DAY, 0, DAY].map((delta) => offsetAt(city, wall + delta)));
    const matches = [...offsets]
      .filter((offset) => Number.isFinite(offset) && Math.abs(offset) <= 840)
      .map((offset) => wall - offset * MINUTE)
      .filter((instant) => instant + offsetAt(city, instant) * MINUTE === wall);
    return matches.length === 1 ? matches[0] : null;
  } catch {
    return null;
  }
}

export function sceneSolar(city: City, date: string, minute: number) {
  const instant = sceneWallInstant(city, date, minute);
  if (instant === null || !Number.isFinite(city.lat) || !Number.isFinite(city.lon) ||
    Math.abs(city.lat) > 90 || Math.abs(city.lon) > 180) return null;
  const altitude = 90 - solarZenithDeg(city.lat, city.lon, subsolarPoint(new Date(instant)));
  return { altitude, gradient: skyGradient(altitude), label: SKY_BAND_LABEL[skyBand(altitude)] };
}

export interface SceneWindow {
  id: string;
  kind: "seek" | "reduce" | "sleep";
  label: string;
  startMin: number;
  endMin: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  fromEarlierDay: boolean;
}

export interface DaySceneModel {
  date: string;
  dayIndex: number;
  dayLabel: string;
  city: City;
  destination: string;
  inOrigin: boolean;
  bodyOffsetMin: number;
  plan: DayPlan | null;
  moment: ReturnType<typeof performanceMoment>;
  momentDate: string | null;
  momentDayIndex: number | null;
  windows: SceneWindow[];
  hasUnplottedWindows: boolean;
  solarPoints: { minute: number; altitude: number | null }[];
}

export function buildDayScene(input: {
  trip: Trip;
  dayIndex: number;
  plans: DayPlan[];
  calendar: CalendarEvent[];
  baseline?: WearableBaseline;
}): DaySceneModel | null {
  const { trip, dayIndex, plans, calendar, baseline } = input;
  const spec = trip.days.find((day) => day.dayIndex === dayIndex);
  if (!spec || dateStart(spec.date) === null) return null;
  const inOrigin = dayIndex <= trip.departureDayIndex;
  const city = inOrigin ? trip.origin : trip.destination;
  const midnight = dateStart(spec.date)!;
  const prior = plans.filter((plan) => plan.dayIndex < dayIndex);
  const lag = remainingLagMin(trip, prior);
  const covered = Math.abs(trip.requiredShiftMin) - lag;
  const bodyOffsetMin = inOrigin
    ? (trip.direction === "east" ? covered : -covered)
    : (trip.direction === "east" ? -lag : lag);
  const moment = performanceMoment({ trip, calendar, plans, baseline });
  const event = moment ? calendar.find((item) => item.id === moment.eventId) : undefined;
  const momentDayIndex = event ? event.movedTo?.dayIndex ?? event.dayIndex : null;
  const windows: SceneWindow[] = [];
  let hasUnplottedWindows = false;
  for (const plan of plans) {
    const sourceDay = trip.days.find((day) => day.dayIndex === plan.dayIndex);
    if (!sourceDay) continue;
    const sourceCity = plan.dayIndex <= trip.departureDayIndex ? trip.origin : trip.destination;
    plan.interventions.forEach((intervention, index) => {
      if (!(intervention.kind in WINDOW_KINDS) || intervention.endMin === undefined) return;
      const info = WINDOW_KINDS[intervention.kind as keyof typeof WINDOW_KINDS];
      const start = intervention.startMin;
      const rawEnd = intervention.endMin;
      if (!Number.isInteger(start) || !Number.isInteger(rawEnd) || start < 0 || start >= 1440 ||
        rawEnd < 0 || rawEnd > 2880) return;
      const end = rawEnd <= start ? rawEnd + 1440 : rawEnd;
      const from = sceneWallInstant(sourceCity, sourceDay.date, start);
      const to = sceneWallInstant(sourceCity, sourceDay.date, end);
      if (from === null || to === null) {
        if (plan.dayIndex === dayIndex || plan.dayIndex === dayIndex - 1) hasUnplottedWindows = true;
        return;
      }
      let localStart: number;
      let localEnd: number;
      try {
        localStart = (from + offsetAt(city, from) * MINUTE - midnight) / MINUTE;
        localEnd = (to + offsetAt(city, to) * MINUTE - midnight) / MINUTE;
      } catch {
        hasUnplottedWindows = true;
        return;
      }
      if (localStart >= 1440 || localEnd <= 0 || localEnd <= localStart) return;
      windows.push({
        id: `${plan.dayIndex}:${index}`,
        ...info,
        startMin: Math.max(0, localStart),
        endMin: Math.min(1440, localEnd),
        continuesBefore: localStart < 0,
        continuesAfter: localEnd > 1440,
        fromEarlierDay: plan.dayIndex < dayIndex,
      });
    });
  }
  return {
    date: spec.date,
    dayIndex,
    dayLabel: spec.label,
    city,
    destination: trip.destination.name,
    inOrigin,
    bodyOffsetMin,
    plan: plans.find((plan) => plan.dayIndex === dayIndex) ?? null,
    moment,
    momentDate: trip.days.find((day) => day.dayIndex === momentDayIndex)?.date ?? null,
    momentDayIndex,
    windows: windows.sort((a, b) => a.startMin - b.startMin),
    hasUnplottedWindows,
    solarPoints: Array.from({ length: 49 }, (_, index) => {
      const minute = index * 30;
      return { minute, altitude: sceneSolar(city, spec.date, minute)?.altitude ?? null };
    }),
  };
}

export function inspectDayScene(scene: DaySceneModel, minute: number) {
  const localMin = clampMinute(minute);
  return {
    localMin,
    bodyMin: wrap(localMin + scene.bodyOffsetMin),
    solar: sceneSolar(scene.city, scene.date, localMin),
    activeWindows: scene.windows.filter((window) => localMin >= window.startMin && localMin < window.endMin),
    eventHere: scene.momentDayIndex === scene.dayIndex && scene.moment?.localMin === localMin,
  };
}
