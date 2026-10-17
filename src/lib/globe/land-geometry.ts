import * as THREE from "three";
import { feature } from "topojson-client";
import worldTopo from "world-atlas/countries-110m.json";
import type { Topology } from "topojson-specification";
import { lonLatToVec3 } from "./spherical";

// Real coastlines as a BufferGeometry.
//
// The SVG globes get their land from `geoPath`, which tessellates and clips for
// them. WebGL has no such luxury, so the rings are triangulated here and lifted
// onto the sphere. Two wrinkles in world-atlas 110m make a naive version
// wrong, and both were measured rather than assumed:
//
//   · 7 of 286 rings jump more than 180° of longitude between consecutive
//     points — a full 360° wrap, which is Russia and friends crossing the
//     antimeridian. Triangulated as-is, those rings throw triangles clean
//     across the globe. `unwrapRing` makes each ring continuous instead;
//     cos/sin make the accumulated ±360 offsets harmless.
//   · one polygon carries holes. three's `ShapeUtils.triangulateShape` takes
//     them as a second argument and cuts them properly.
//
// Antarctica's ring runs along lat −90, which is a single point on a sphere,
// so its planar triangulation collapses into a fan from the south pole to the
// coastline. That is very nearly the right shape and is what every globe
// shader does; it is called out rather than hidden.

const RING = 1.0;
/** Land sits fractionally proud of the dawn sphere so the two never
 *  z-fight on the horizon at grazing angles. */
export const LAND_RADIUS = RING;
export const LAND_LIFT = 0.0015;

type Ring = [number, number][];

function unwrapRing(ring: Ring): Ring {
  const out: Ring = [[...ring[0]] as [number, number]];
  let acc = ring[0][0];
  for (let i = 1; i < ring.length; i++) {
    let lon = ring[i][0];
    while (lon - acc > 180) lon -= 360;
    while (lon - acc < -180) lon += 360;
    acc = lon;
    out.push([lon, ring[i][1]]);
  }
  return out;
}

/** Drop a ring's repeated closing vertex and any consecutive duplicates, both
 *  of which make the ear-clipper produce zero-area triangles. */
function cleanRing(ring: Ring): Ring {
  const out: Ring = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push([p[0], p[1]]);
  }
  while (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) out.pop();
    else break;
  }
  return out;
}

export interface LandGeometryResult {
  geometry: THREE.BufferGeometry;
  /** Rings that produced geometry, for the record. */
  rings: number;
  triangles: number;
  /** Rings that could not be triangulated. Expected 0 — non-zero means a
   *  coastline is missing and the log says which. */
  failedRings: number;
}

let cached: LandGeometryResult | null = null;

export function landGeometry(): LandGeometryResult {
  if (cached) return cached;

  const geo = feature(
    worldTopo as unknown as Topology,
    (worldTopo as unknown as Topology).objects.countries,
  ) as unknown as {
    features: { geometry: { type: string; coordinates: unknown } }[];
  };

  const positions: number[] = [];
  let rings = 0;
  let triangles = 0;
  let failedRings = 0;

  const emitPolygon = (poly: Ring[]) => {
    const outer = cleanRing(unwrapRing(poly[0] ?? []));
    if (outer.length < 3) return;
    const holeRings = poly
      .slice(1)
      .map((h) => cleanRing(unwrapRing(h)))
      .filter((h) => h.length >= 3);

    // `ShapeUtils.triangulateShape` reads `.x`/`.y` off its inputs, so it needs
    // Vector2s — handing it [lon, lat] tuples silently produces NaN geometry
    // rather than an error, which is how this module first returned an empty
    // globe. Convert once, here, and keep the lon/lat pool alongside so the
    // vertices can be lifted onto the sphere afterwards.
    const contour = outer.map(([lon, lat]) => new THREE.Vector2(lon, lat));
    const holes = holeRings.map((h) => h.map(([lon, lat]) => new THREE.Vector2(lon, lat)));

    let faces: number[][];
    try {
      faces = THREE.ShapeUtils.triangulateShape(contour, holes);
    } catch (err) {
      // Counted and surfaced rather than swallowed: a ring that will not
      // triangulate is a data problem, and silently dropping it is how you get
      // a globe with a hole in the Atlantic and no error to explain it.
      failedRings++;
      if (failedRings <= 3) console.warn("land: ring failed to triangulate", err);
      return;
    }

    // Faces index into `outer` followed by the flattened holes.
    const pool: Ring = [...outer, ...holeRings.flat()];
    for (const f of faces) {
      const pts = f.map((i) => pool[i]);
      if (pts.length !== 3) continue;
      for (const [lon, lat] of pts) {
        const v = lonLatToVec3(lon, lat, LAND_RADIUS + LAND_LIFT);
        positions.push(v.x, v.y, v.z);
      }
      triangles++;
    }
    rings += 1 + holeRings.length;
  };

  for (const f of geo.features) {
    const g = f.geometry;
    if (g.type === "Polygon") emitPolygon(g.coordinates as Ring[]);
    else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates as Ring[][]) emitPolygon(poly);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  cached = { geometry, rings, triangles, failedRings };
  return cached;
}