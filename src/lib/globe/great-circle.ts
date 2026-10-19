import * as THREE from "three";
import { geoInterpolate, geoDistance } from "d3-geo";
import type { SubsolarPoint } from "@/domain/sun";
import { sunDirection, lonLatToVec3 } from "./spherical";
import type { Trip } from "@/domain/types";

// The great circle the camera flies, and the machinery to fly it.
//
// `geoInterpolate` is the same function WorldLens draws its flight arc with, so
// the path this camera follows is the arc the SVG globe already shows — not a
// second, prettier route that disagrees with it by a few degrees. The short way
// round is geoInterpolate's job; it takes the antimeridian crossing without a
// wrap hack, and a test asserts the two agree.

export interface GreatCircle {
  /** Unit vectors along the arc, origin first. */
  points: THREE.Vector3[];
  /** Great-circle distance in degrees. */
  spanDeg: number;
  /** The endpoint bearings, for orienting the camera on arrival. */
  from: { lon: number; lat: number };
  to: { lon: number; lat: number };
}

/** Sample density. 256 segments over a half-world arc is ~0.7° each, which is
 *  finer than the terminator's own 0.5° tessellation, so the camera never
 *  cuts a corner the drawn line does not. */
const SEGMENTS = 256;

export function greatCircle(trip: Trip, radius = 1): GreatCircle {
  const a: [number, number] = [trip.origin.lon, trip.origin.lat];
  const b: [number, number] = [trip.destination.lon, trip.destination.lat];
  const interp = geoInterpolate(a, b);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const [lon, lat] = interp(i / SEGMENTS);
    points.push(lonLatToVec3(lon, lat, radius).normalize());
  }
  return {
    points,
    spanDeg: (geoDistance(a, b) * 180) / Math.PI,
    from: { lon: a[0], lat: a[1] },
    to: { lon: b[0], lat: b[1] },
  };
}

/** Position and unit tangent at `t` along the arc, by linear interpolation
 *  between samples. Linear between 256 chords is well under a pixel of error at
 *  any sane camera distance, and it is cheap enough to call every frame. */
export function alongArc(
  gc: GreatCircle,
  t: number,
): { point: THREE.Vector3; tangent: THREE.Vector3 } {
  const n = gc.points.length - 1;
  const clamped = Math.max(0, Math.min(1, t));
  const f = clamped * n;
  const i = Math.min(n - 1, Math.floor(f));
  const frac = f - i;
  const a = gc.points[i];
  const b = gc.points[i + 1];
  const point = a.clone().lerp(b, frac).normalize();
  const tangent = b.clone().sub(a).normalize();
  return { point, tangent };
}

/** Half-width of the dawn-crossing window, as a share of the arc (0..1).
 *  0.04 is about a second of the 20s flight on either side of the crossing —
 *  long enough to be felt, short enough to be a moment, not a mood. */
export const CROSSING_WINDOW = 0.04;

/** Where the flight crosses the terminator.
 *
 *  The terminator is essentially stationary for the length of the flight —
 *  the sun moves a tenth of a degree in 20s — so the *crossing* happens
 *  because the route, not the Earth, moves through it. This finds that spot
 *  as an arc fraction, by walking the samples and locating the sign change of
 *  `dot(point, sunDir)` — the same dot product the terminator shader and
 *  `isDaylight` are built on, so the crossing here cannot disagree with the
 *  line drawn on the globe or the tooltip's daylight answer.
 *
 *  The first crossing is the moment: a route that dips across the terminator
 *  and back reports only its entry into the new side. Returns null for a
 *  route that spends its whole arc on one side of the line — the honest
 *  answer is that there is no crossing to feel, not a moment invented. */
export interface DawnCrossing {
  /** Arc fraction 0..1 where the route's surface point changes daylight
   *  state. Compare against the *eased* flight fraction (see `easeInOut`). */
  t: number;
  /** Entering night (`dusk`) or entering day (`dawn`) at the crossing. */
  direction: "dusk" | "dawn";
}

export function dawnCrossing(gc: GreatCircle, sub: SubsolarPoint): DawnCrossing | null {
  const sun = sunDirection(sub);
  const n = gc.points.length - 1;
  let prev = gc.points[0].dot(sun);
  for (let i = 1; i <= n; i++) {
    const cur = gc.points[i].dot(sun);
    // A crossing is a strict sign flip; a sample exactly on the terminator
    // (dot ≈ 0) matches its neighbour's side and produces no phantom moment.
    const side = (d: number) => (d < 0 ? -1 : 1);
    if (side(cur) !== side(prev)) {
      const frac = Math.abs(prev) / (Math.abs(prev) + Math.abs(cur));
      const direction = prev > 0 ? "dusk" : "dawn";
      return { t: (i - 1 + frac) / n, direction };
    }
    prev = cur;
  }
  return null;
}

/** Cubic ease-in-out. The move has to start from rest and arrive at rest: a
 *  camera that lurches the moment it starts is a screensaver, and one that
 *  stops dead at the destination is worse. */
export function easeInOut(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** Orbit offset for a point on the path: behind the tangent, lifted, so the
 *  globe turns away from the traveller as they cross it rather than sliding
 *  sideways underneath them. */
export function chasePosition(
  target: THREE.Vector3,
  tangent: THREE.Vector3,
  distance: number,
  lift: number,
): THREE.Vector3 {
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(tangent, up);
  if (side.lengthSq() < 1e-9) side.set(1, 0, 0);
  side.normalize();
  const back = tangent.clone().negate();
  return target
    .clone()
    .addScaledVector(back, distance)
    .addScaledVector(up, lift)
    .addScaledVector(side, lift * 0.28);
}