import * as THREE from "three";
import type { SubsolarPoint } from "@/domain/sun";

// lon/lat → 3D, for the WebGL globe.
//
// The mapping is chosen so that it is not merely *a* sphere, but the one whose
// geometry agrees with the rest of the app by construction. `solarZenithDeg`
// (domain/sun.ts) is the spherical law of cosines:
//
//   cosZ = sinφ·sinδ + cosφ·cosδ·cos(λ − λsun)
//
// and for the unit vector below,
//
//   u(φ,λ) = (cosφ·cosλ, sinφ, cosφ·sinλ)
//
// the dot product u(φ,λ)·u(δ,λsun) expands to exactly that expression. So
//
//   dot(normal, sunDir) > 0   ⟺   solarZenithDeg < 90°   ⟺   isDaylight()
//
// which means the shader's terminator and the SVG globe's terminator are not
// two implementations of the same idea that might drift — they are one
// formula. `tests/globe-port.test.ts` asserts that equivalence numerically.
//
// North is +Y (three's up axis) and the axis through lat 0/lon 0 is +X, so
// the default camera framing puts Greenwich dead centre without a rotation.

export const DEG = Math.PI / 180;

/** Unit vector for a geographic coordinate. Radius defaults to 1 so callers
 *  wanting a direction (sun, body sun) don't have to remember to normalise. */
export function lonLatToVec3(lon: number, lat: number, radius = 1): THREE.Vector3 {
  const la = lat * DEG;
  const lo = lon * DEG;
  const cosLa = Math.cos(la);
  return new THREE.Vector3(
    radius * cosLa * Math.cos(lo),
    radius * Math.sin(la),
    radius * cosLa * Math.sin(lo),
  );
}

/** The inverse: the lon/lat whose unit vector is `v`. Used to place labels
 *  back on the sphere and to check a camera round-trips. */
export function vec3ToLonLat(v: THREE.Vector3): { lon: number; lat: number } {
  const n = v.clone().normalize();
  return {
    lat: Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) / DEG,
    lon: Math.atan2(n.z, n.x) / DEG,
  };
}

/** Where the sun is, as a direction — the single uniform the day/night shader
 *  needs. Same model as the SVG surfaces; nothing here re-derives it. */
export function sunDirection(sub: SubsolarPoint): THREE.Vector3 {
  return lonLatToVec3(sub.lon, sub.lat, 1).normalize();
}

/** Orthonormal camera basis looking at a geographic centre from outside.
 *
 *  `right` is east and `up` is north, matching d3's orthographic screen
 *  convention (x grows eastward, y grows southward). Shared with the port
 *  test, which projects through this basis and compares against
 *  `d3.geoOrthographic` pixel-for-pixel. */
export function viewBasis(
  centerLon: number,
  centerLat: number,
): { forward: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3 } {
  const forward = lonLatToVec3(centerLon, centerLat, 1).normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  // At the poles `forward` is parallel to worldUp and the cross product
  // degenerates; fall back to the prime meridian, which keeps the basis valid
  // so a camera parked over the pole does not produce NaN matrices.
  const right = new THREE.Vector3().crossVectors(forward, worldUp);
  if (right.lengthSq() < 1e-12) right.set(0, 0, 1);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();
  return { forward, right, up };
}

/** Project a lon/lat to screen px the way d3's orthographic would, given the
 *  same centre, scale and translate. Exported for the port test only. */
export function projectOrthographic(
  lon: number,
  lat: number,
  centerLon: number,
  centerLat: number,
  k: number,
  tx: number,
  ty: number,
): [number, number] | null {
  const v = lonLatToVec3(lon, lat, 1);
  const { forward, right, up } = viewBasis(centerLon, centerLat);
  // Beyond the horizon d3 clips; the dot going negative is the same test.
  const depth = v.dot(forward);
  if (depth < 0) return null;
  return [v.dot(right) * k + tx, -v.dot(up) * k + ty];
}

/** Zoom is tracked in 10% steps of surface distance so the split decision
 *  re-runs on a real zoom, not every frame. */
export const ZOOM_STEP = 1.1;

/** Which 10% bucket a surface distance falls in — `stepDistance(zoomStep(d))`
 *  is within ±~5% of `d`. */
export function zoomStep(surfaceDist: number): number {
  return Math.round(Math.log(surfaceDist) / Math.log(ZOOM_STEP));
}

/** The surface distance at the centre of a step bucket. */
export function stepDistance(step: number): number {
  return ZOOM_STEP ** step;
}

/** Pixels per degree at the globe's surface, for the city-light split test.
 *  Measured to the *surface*, not the origin — what matters is how many
 *  pixels a metro covers, and it covers them up close. */
export function pxPerDegAt(fovDeg: number, heightPx: number, surfaceDist: number): number {
  const halfH = heightPx / 2 / Math.tan((fovDeg * DEG) / 2);
  return (halfH / surfaceDist) * (180 / Math.PI);
}
