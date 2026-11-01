import { fmtMin } from "@/domain/circadian";
import { buildTrip } from "@/domain/fixtures";
import type { CityCode } from "@/domain/types";

// The landing's stakes line, computed from the route as it is typed.
//
// The canonical sentence — "your 07:00 Tokyo meeting is 23:00 body time" —
// used to be static copy, so a traveller typing JFK → CDG was still being
// sold Tokyo. The stakes belong to *their* route, and the maths already
// exists: the body clock at a destination-local moment is that moment plus
// the shift the trip owes (negative eastbound, positive west), so a 07:00
// Tokyo morning lands at 23:00 for a London body.
//
// The assumption is stated, not smuggled: there is no calendar at the entry
// form, so the read is about the first 07:00 morning at the destination —
// the product's signature register — never about a meeting the traveller
// hasn't told us about.

/** The canonical assumed moment: the first 07:00 morning at destination. */
export const ASSUMED_MORNING_MIN = 7 * 60;

export interface RouteGapRead {
  originName: string;
  destName: string;
  direction: "east" | "west";
  /** The shift the trip owes, in minutes (always ≥ 0). */
  gapMin: number;
  /** Signed shift (east negative) — the landing stage needs the sign for
   *  the body's sub-solar point, not just the magnitude. */
  signedShiftMin: number;
  /** Destination coordinates — the stage's body sun must rise over *their*
   *  route, not the demo's. */
  destLat: number;
  destLon: number;
  /** The assumed destination-local moment. */
  localMin: number;
  /** What that moment reads as on the traveller's body clock. */
  bodyMin: number;
}

/** The gap read for a route draft. Null for airports the registry doesn't
 *  know — a missing preview is honest, a guessed one isn't. */
export function routeGapRead(route: {
  origin: string;
  dest: string;
  date: string;
}): RouteGapRead | null {
  try {
    const trip = buildTrip(
      route.origin.toUpperCase() as CityCode,
      route.dest.toUpperCase() as CityCode,
      route.date,
    );
    const bodyMin = ((ASSUMED_MORNING_MIN + trip.requiredShiftMin) % 1440 + 1440) % 1440;
    return {
      originName: trip.origin.name,
      destName: trip.destination.name,
      direction: trip.direction,
      gapMin: Math.abs(trip.requiredShiftMin),
      signedShiftMin: trip.requiredShiftMin,
      destLat: trip.destination.lat,
      destLon: trip.destination.lon,
      localMin: ASSUMED_MORNING_MIN,
      bodyMin,
    };
  } catch {
    return null;
  }
}

/** The headline form: the stakes as one sentence. */
export function routeGapHeadline(r: RouteGapRead): string {
  if (r.gapMin === 0) return `${r.destName} already runs on your body's time.`;
  return `A ${fmtMin(r.localMin)} morning in ${r.destName} is ${fmtMin(r.bodyMin)} body time.`;
}

/** The compact form for the live line under the form. */
export function routeGapLine(r: RouteGapRead): string {
  if (r.gapMin === 0) return "no shift to bank";
  return `${(r.gapMin / 60).toFixed(1)}h to move · ${r.direction}bound`;
}
