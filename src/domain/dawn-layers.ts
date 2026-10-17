import { geoCircle } from "d3-geo";
import type { GeoPath, GeoPermissibleObjects } from "d3-geo";
import { bodySubsolarPoint, wrapLon, type SubsolarPoint } from "./sun";

// The day/night layers of the dawn globe, in one place.
//
// Two surfaces draw this and used to draw it separately: the crew lens
// (lenses/WorldLens) and the home hero (components/HeroDawnPanel). They agreed
// on the geometry but not on the units — the lens was handed the gap in
// degrees and re-derived the sign itself, the hero was handed minutes and let
// bodySubsolarPoint do it. Every one of those is a place the two curves could
// quietly disagree. One builder, one unit, both surfaces call it.

export interface DawnLayers {
  /** The 90° cap around the sub-solar antipode: full night. */
  nightPath: string | null;
  /** The same cap at 96°, drawn under the night so it bleeds through the
   *  terminator as the twilight band. */
  twilightPath: string | null;
  /** The day/night line itself, 90°, finer precision for a crisp edge. */
  terminatorPath: string | null;
  /** The body's own dawn — the same circle with the sun shifted by whatever
   *  shift the plan still owes. null once the gap is too small to see. */
  ghostPath: string | null;
  /** Where the body's dawn crosses the equator, for labelling the ghost.
   *  null whenever ghostPath is. */
  ghostDawnLon: number | null;
  /** The body's sub-solar longitude, so a caller can place labels without
   *  re-deriving the signed drift. */
  bodyLon: number;
}

/** Degrees of longitude per minute of body-clock shift. The earth turns 15° an
 *  hour, so one minute of shift is a quarter of a degree — the conversion the
 *  crew lens was doing by hand and the hero was doing inside the domain. */
export const DEG_PER_SHIFT_MIN = 15 / 60;

export const shiftMinToDeg = (min: number): number => min * DEG_PER_SHIFT_MIN;
export const shiftDegToMin = (deg: number): number => deg / DEG_PER_SHIFT_MIN;

/** Below this many minutes the two dawns are visually the same line, so the
 *  ghost is not drawn at all rather than drawn on top of itself. Matches the
 *  threshold the hero's caption uses to drop its gap phrase. */
export const GHOST_VISIBLE_MIN = 6;

export interface DawnLayersOptions {
  /** geoCircle precision for the ghost curve. The hero has one small disc and
   *  can afford 0.5°; the crew lens redraws every animation frame and passes 1. */
  ghostPrecision?: number;
}

export function dawnLayers(
  gen: GeoPath,
  sub: SubsolarPoint,
  owedMin: number,
  requiredShiftMin: number,
  options: DawnLayersOptions = {},
): DawnLayers {
  const ghostPrecision = options.ghostPrecision ?? 0.5;
  const antipode: [number, number] = [wrapLon(sub.lon + 180), -sub.lat];

  // bodySubsolarPoint owns the sign and the cap at the trip's full shift, so
  // the ghost can never be drawn past where the trip could actually take it.
  const body = bodySubsolarPoint(sub, owedMin, requiredShiftMin);
  const gapOpen = Math.abs(owedMin) >= GHOST_VISIBLE_MIN;

  const circle = (center: [number, number], radius: number, precision: number) =>
    gen(geoCircle().center(center).radius(radius).precision(precision)() as GeoPermissibleObjects);

  return {
    nightPath: circle(antipode, 90, 1),
    twilightPath: circle(antipode, 96, 1),
    terminatorPath: circle(antipode, 90, 0.5),
    ghostPath: gapOpen ? circle([wrapLon(body.lon + 180), -body.lat], 90, ghostPrecision) : null,
    ghostDawnLon: gapOpen ? wrapLon(body.lon - 90) : null,
    bodyLon: body.lon,
  };
}