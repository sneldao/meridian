import { evaluatePlan } from "@/domain/circadian";
import {
  ADHERENCE_PROFILE,
  GARMIN_BASELINE,
  resolveBaseline,
  type WakeBand,
} from "@/domain/fixtures";
import { previewPlan, type SolvedDay } from "@/domain/solver";
import type { Trip, TripData } from "@/domain/types";
import { matchSampleProfileForTrip, splitSamplePlaces } from "@/lib/sample-taste";
import { readTasteProfile, readTripTaste } from "@/lib/use-trip-taste";
import type { CrewAccountRow } from "@/components/CrewAccount";

/* The crew's account closes on the real payload: the same trip, calendar
 * and baseline the plan build runs against. Moved out of the Home fetch
 * effect so the accounting is a pure, tested function of the payload —
 * the effect only fetches, validates, and stores. */

/** The payload belongs to this route/date when the trip's own codes and
 *  departure day match what was asked for. */
export function validateTripPayload(
  d: TripData,
  ctx: { origin: string; dest: string; departureDate: string },
): boolean {
  const depDay = d?.trip?.days?.find((x) => x.dayIndex === d.trip.departureDayIndex);
  return (
    d?.trip?.origin?.code === ctx.origin &&
    d?.trip?.destination?.code === ctx.dest &&
    depDay?.date === ctx.departureDate
  );
}

/** The account rows for a validated payload, in the same order the fetch
 *  effect always pushed them: light windows, conflict scan, crate match. */
export function buildTripAccountRows(
  d: TripData,
  ctx: { origin: string; dest: string; departureDate: string; wakeBand: WakeBand | null },
): CrewAccountRow[] {
  const accountRows: CrewAccountRow[] = [];
  const trip: Trip | undefined = d?.trip;
  if (!trip) return accountRows;
  const base = resolveBaseline(ctx.wakeBand, d.baseline ?? GARMIN_BASELINE);
  const adherence = d.adherence ?? ADHERENCE_PROFILE;
  const calendar = d.calendar ?? [];
  try {
    const solved = previewPlan({ trip, calendar, adherence, baseline: base });
    const solvedDays = [...solved.values()]
      .filter((s): s is SolvedDay => !!s)
      .map((s) => s.plan);
    const lightCount = solvedDays.reduce(
      (n, p) => n + p.interventions.filter((iv) => iv.kind === "light_exposure").length,
      0,
    );
    const lightDays = solvedDays.filter((p) =>
      p.interventions.some((iv) => iv.kind === "light_exposure"),
    ).length;
    accountRows.push({
      id: "light",
      label: "Computed light windows",
      secondary: lightCount
        ? `${lightCount} across ${lightDays} ${lightDays === 1 ? "day" : "days"}`
        : "none placed",
    });
    const verdict = evaluatePlan({
      trip,
      days: solvedDays,
      calendar,
      adherence,
      baseline: base,
    });
    const flagged =
      verdict.violations.filter((v) => v.code === "CALENDAR_CONFLICT").length +
      verdict.notes.filter((n) => n.includes("overlaps movable")).length;
    accountRows.push({
      id: "conflicts",
      label: "Checked for conflicts",
      secondary: flagged ? `${flagged} flagged` : "none",
    });
  } catch {
    accountRows.push({
      id: "light",
      label: "Computed light windows",
      secondary: "the solver could not place this route",
    });
    accountRows.push({
      id: "conflicts",
      label: "Checked for conflicts",
      secondary: "the scan needs the crew",
    });
  }
  try {
    const scope = `${ctx.origin}-${ctx.dest}-${ctx.departureDate}`;
    let favorites = readTripTaste(localStorage, scope);
    if (!favorites.length) favorites = readTasteProfile(localStorage);
    if (!favorites.length) {
      accountRows.push({ id: "crate", label: "Matched your crate", secondary: "no crate packed" });
    } else {
      const entities = `${favorites.length} ${favorites.length === 1 ? "entity" : "entities"}`;
      const matched = matchSampleProfileForTrip(trip.destination.name, favorites);
      if (matched) {
        const { daytime, evening } = splitSamplePlaces(matched.places);
        /* The evening list re-includes daytime venues as fallbacks
           (splitSamplePlaces' own ordering), so count the distinct
           places the crate actually matched — never a double count. */
        const places = new Set(
          [...daytime, ...evening].map((p) => p.id ?? p.name),
        ).size;
        accountRows.push({
          id: "crate",
          label: "Matched your crate",
          secondary: `${entities} · ${places} ${places === 1 ? "place" : "places"}`,
        });
      } else {
        accountRows.push({
          id: "crate",
          label: "Matched your crate",
          secondary: `${entities} · places resolve with the crew`,
        });
      }
    }
  } catch {
    accountRows.push({ id: "crate", label: "Matched your crate", secondary: "no crate packed" });
  }
  return accountRows;
}
