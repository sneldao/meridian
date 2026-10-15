// City lights. The world lens draws the earth as the airports people actually
// fly between — ~1,150 dots, which is why the landmasses emerge from the map at
// all. But drawn identically at every zoom level they smear into a glow rather
// than resolving into structure, so the dots are grouped once, here, and the
// lens decides per frame whether a group is still one light or has spread
// enough on screen to be its members.
//
// The grouping is a lat/lon grid rather than a distance-based cluster: it is
// O(n), it is stable (the same airport is in the same group every run, so the
// texture does not shimmer between renders), and a grid cell never straddles
// the antimeridian, which keeps the centroid a plain mean instead of a
// circular one. A cell is ~200 km wide at the equator.
//
// This module is geography only — no projection, no React. The lens supplies
// the one number that depends on the view: pixels per degree.

export interface Dot {
  lat: number;
  lon: number;
}

export interface Cluster<T extends Dot> {
  /** Mean position of the group's airports. */
  lat: number;
  lon: number;
  /** The group's airports — a grid cell's worth, at least one. */
  members: T[];
  /** Angular distance from the centroid to the furthest member, in degrees. */
  radiusDeg: number;
}

/** Grid cell edge in degrees. ~200 km, so a metro's airports share a light. */
export const DOT_CELL_DEG = 3;

/**
 * A group resolves into its members once it covers more than this many screen
 * pixels. Below it the members would be indistinguishable anyway, so drawing
 * one brighter light is both cheaper and more honest.
 */
export const EXPAND_PX = 9;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Great-circle distance in degrees (haversine). */
export function angularDeg(a: Dot, b: Dot): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) * DEG;
}

/**
 * Group points into grid cells and measure each group. Every input point lands
 * in exactly one cluster, and a lone airport is a cluster of one with a radius
 * of zero — so the lens can treat the whole set uniformly.
 */
export function clusterAirports<T extends Dot>(
  points: readonly T[],
  cellDeg: number = DOT_CELL_DEG,
): Cluster<T>[] {
  if (!(cellDeg > 0)) throw new Error("cellDeg must be positive");
  const cells = new Map<string, T[]>();
  for (const p of points) {
    const key = `${Math.floor(p.lat / cellDeg)}:${Math.floor(p.lon / cellDeg)}`;
    const cell = cells.get(key);
    if (cell) cell.push(p);
    else cells.set(key, [p]);
  }

  const out: Cluster<T>[] = [];
  for (const members of cells.values()) {
    const lat = members.reduce((s, m) => s + m.lat, 0) / members.length;
    const lon = members.reduce((s, m) => s + m.lon, 0) / members.length;
    const centroid = { lat, lon };
    out.push({
      lat,
      lon,
      members,
      radiusDeg: members.reduce((r, m) => Math.max(r, angularDeg(centroid, m)), 0),
    });
  }
  return out;
}

/** Does this group now cover enough screen to separate into its members? */
export function shouldSplit(
  radiusDeg: number,
  pxPerDeg: number,
  thresholdPx: number = EXPAND_PX,
): boolean {
  return radiusDeg * pxPerDeg > thresholdPx;
}
