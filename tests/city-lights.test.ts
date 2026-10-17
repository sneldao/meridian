import { describe, expect, test } from "bun:test";
import { geoNaturalEarth1 } from "d3-geo";
import {
  type Cluster,
  type Dot,
  DOT_CELL_DEG,
  EXPAND_PX,
  angularDeg,
  clusterAirports,
  dotBrightness,
  resolveLightSet,
  shouldSplit,
} from "../src/domain/city-lights";
import { AIRPORTS } from "../src/domain/airports";

// The lens's own geometry — same fit, same 1.04 overscan — so the split
// threshold is tested against the pixels the map actually has.
const fitted = geoNaturalEarth1().fitExtent(
  [
    [6, 6],
    [994, 514],
  ],
  { type: "Sphere" },
);
const PX_PER_DEG = ((fitted.scale() * 1.04) * Math.PI) / 180;
const atZoom = (z: number) => PX_PER_DEG * z;

const at = (lat: number, lon: number): Dot => ({ lat, lon });
const codesOf = (c: Cluster<{ code: string }>) =>
  c.members.map((m) => m.code).sort().join(",");
const byCode = (clusters: Cluster<{ code: string }>[]) =>
  clusters.map(codesOf).sort();

describe("angularDeg", () => {
  test("identical points are zero apart", () => {
    expect(angularDeg(at(51.5, -0.45), at(51.5, -0.45))).toBe(0);
  });

  test("a degree of latitude is a degree of arc", () => {
    expect(angularDeg(at(51, 0), at(52, 0))).toBeCloseTo(1, 6);
  });

  test("it is symmetric", () => {
    const a = at(35.68, 139.77);
    const b = at(51.47, -0.46);
    expect(angularDeg(a, b)).toBeCloseTo(angularDeg(b, a), 9);
  });
});

describe("clusterAirports — the contract the lens relies on", () => {
  test("every point lands in exactly one cluster", () => {
    const clusters = clusterAirports(AIRPORTS);
    const total = clusters.reduce((s, c) => s + c.members.length, 0);
    expect(total).toBe(AIRPORTS.length);
    expect(new Set(clusters.flatMap((c) => c.members.map((m) => m.code))).size).toBe(
      AIRPORTS.length,
    );
  });

  test("a lone airport is a cluster of one with no radius", () => {
    const [c] = clusterAirports([at(-33.94, 151.18)]);
    expect(c.members).toHaveLength(1);
    expect(c.radiusDeg).toBe(0);
    expect(c).toMatchObject({ lat: -33.94, lon: 151.18 });
  });

  test("every cluster has at least one member and no empty cells", () => {
    for (const c of clusterAirports(AIRPORTS)) {
      expect(c.members.length).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lon)).toBe(true);
    }
  });

  test("same-cell airports share a light; different cells do not", () => {
    // LHR and LGW are 0.36° apart in lon and both inside one cell.
    const clusters = clusterAirports([
      { code: "LHR", lat: 51.4706, lon: -0.4619 },
      { code: "LGW", lat: 51.1481, lon: -0.1903 },
      { code: "HND", lat: 35.5494, lon: 139.7798 },
    ]);
    expect(clusters).toHaveLength(2);
    const london = clusters.find((c) => c.members.length === 2);
    expect(london && codesOf(london)).toBe("LGW,LHR");
    // Centroid sits between them, and the radius reaches the further one.
    expect(london!.lon).toBeCloseTo(-0.3261, 3);
    expect(london!.radiusDeg).toBeGreaterThan(0.18);
    expect(london!.radiusDeg).toBeLessThan(0.36);
  });

  test("the group is stable when the input order changes", () => {
    const shuffled = [...AIRPORTS].reverse();
    expect(byCode(clusterAirports(shuffled))).toEqual(byCode(clusterAirports(AIRPORTS)));
  });

  test("no cluster straddles the antimeridian, so a plain mean is safe", () => {
    for (const c of clusterAirports(AIRPORTS)) {
      for (const m of c.members) {
        expect(Math.abs(m.lon - c.lon)).toBeLessThan(DOT_CELL_DEG);
      }
    }
  });

  test("a cluster's radius stays within its cell", () => {
    for (const c of clusterAirports(AIRPORTS)) {
      expect(c.radiusDeg).toBeLessThan(DOT_CELL_DEG * 1.5);
    }
  });

  test("it rejects a nonsensical cell size", () => {
    expect(() => clusterAirports([at(0, 0)], 0)).toThrow();
  });
});

describe("shouldSplit", () => {
  test("nothing splits below the threshold, everything above it", () => {
    expect(shouldSplit(2, 4, 9)).toBe(false);
    expect(shouldSplit(2.5, 4, 9)).toBe(true);
  });

  test("a zero-radius (single-airport) group never splits", () => {
    expect(shouldSplit(0, 1000)).toBe(false);
  });
});

describe("dotBrightness — the same curve the SVG lens keys its dots on", () => {
  test("fully off in daylight", () => {
    expect(dotBrightness(90)).toBe(0);
    expect(dotBrightness(45)).toBe(0);
    expect(dotBrightness(0)).toBe(0);
  });

  test("fully lit below the lens's 12° night ramp", () => {
    expect(dotBrightness(102)).toBe(1);
    expect(dotBrightness(180)).toBe(1);
  });

  test("is the lens's formula, not a lookalike every divergence would falsify", () => {
    // Midpoint: (96 - 90) / 12 = 0.5.
    expect(dotBrightness(96)).toBeCloseTo(0.5, 12);
    // And monotone through the ramp — a dimming dot never brightens back.
    let prev = -1;
    for (let z = 90; z <= 102; z += 0.25) {
      const b = dotBrightness(z);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });

  test("arguments are zenith angle, 0 overhead to 180 underfoot", () => {
    // Below the horizon the zenith keeps growing past 90 — 120° underfoot is
    // deep night, right where city lights matter most.
    expect(dotBrightness(120)).toBe(1);
    expect(dotBrightness(180)).toBe(1);
  });
});

describe("resolveLightSet — the split is per cluster, never per map-order accident", () => {
  // Two airports across one 3° cell (corner to corner ~2°, centroid-to-far
  // edge ~1.9°) → a dense cluster; two airports 0.2° apart → a sparse cluster
  // the same resolution leaves merged. One global threshold would treat both
  // identically.
  const dense = [
    { code: "A1", lat: 0, lon: 0 },
    { code: "A2", lat: 2.7, lon: 2.7 },
  ];
  const sparse = [
    { code: "S1", lat: 0, lon: 10.2 },
    { code: "S2", lat: 0.2, lon: 10.3 },
  ];

  test("a dense group resolves into members while a sparse one stays one light", () => {
    // pxPerDeg 6: dense covers ~11px (> 9), sparse ~1px (< 9).
    const out = resolveLightSet([...clusterAirports(dense), ...clusterAirports(sparse)], 6);
    expect(out).toHaveLength(3); // two members + one held centroid
    // Exactly the dense pair plus the sparse centroid.
    const lats = out.map((d) => +d.lat.toFixed(6)).sort((a, b) => a - b);
    expect(lats).toEqual([0, 0.1, 2.7]);
  });

  test("at a tighter zoom the same sparse group also resolves", () => {
    const out = resolveLightSet([...clusterAirports(dense), ...clusterAirports(sparse)], 100);
    expect(out).toHaveLength(4);
  });

  test("agrees with shouldSplit per cluster, wherever the input was placed", () => {
    const clusters = clusterAirports(AIRPORTS);
    const expected = clusters.reduce(
      (s, c) => s + (shouldSplit(c.radiusDeg, 6) ? c.members.length : 1),
      0,
    );
    // Reversing the input must not change the count — the split decision is
    // the cluster's own, not clusters[0]'s.
    expect(resolveLightSet(clusters, 6)).toHaveLength(expected);
    expect(resolveLightSet([...clusters].reverse(), 6)).toHaveLength(expected);
  });

  test("every emitted dot is placeable and no wider than the input set", () => {
    const clusters = clusterAirports(AIRPORTS);
    for (const px of [1.5, 4, 6, 8]) {
      const out = resolveLightSet(clusters, px);
      expect(out.length).toBeLessThanOrEqual(AIRPORTS.length);
      for (const d of out) {
        expect(Number.isFinite(d.lat)).toBe(true);
        expect(Number.isFinite(d.lon)).toBe(true);
      }
    }
  });
});

describe("against the real 1,150-airport set at the lens's zoom levels", () => {
  const clusters = clusterAirports(AIRPORTS);
  const splitCount = (zoom: number) =>
    clusters.filter((c) => shouldSplit(c.radiusDeg, atZoom(zoom))).length;

  test("the world view is still dotted light, not a blowout", () => {
    // 1,145 airports become fewer, brighter dots — the texture survives.
    expect(clusters.length).toBeGreaterThan(500);
    expect(clusters.length).toBeLessThan(AIRPORTS.length);
  });

  test("at 1x every airport is still a single light", () => {
    expect(splitCount(1)).toBe(0);
  });

  test("dense regions separate as you zoom in, monotonically", () => {
    const ladder = [1, 1.5, 2, 3, 4, 6, 8].map(splitCount);
    for (let i = 1; i < ladder.length; i++) {
      expect(ladder[i]!).toBeGreaterThanOrEqual(ladder[i - 1]!);
    }
    expect(ladder[2]!).toBeGreaterThan(0);
    expect(splitCount(4)).toBeGreaterThan(20);
    expect(splitCount(8)).toBeGreaterThan(splitCount(4));
  });

  test("a group that stays merged at full zoom is genuinely one place", () => {
    // Even at 8x the lens shows ~38 degrees of longitude, so Rio's GIG/SDU or
    // Chicago's MDW/ORD are a couple of pixels apart there. Merging those is
    // honest; merging a group that has visibly spread would be the bug.
    const stillMerged = clusters.filter(
      (c) => c.members.length > 1 && !shouldSplit(c.radiusDeg, atZoom(8)),
    );
    for (const c of stillMerged) {
      expect(c.radiusDeg * atZoom(8)).toBeLessThan(EXPAND_PX);
    }
    expect(stillMerged.length).toBeGreaterThan(0);
    expect(stillMerged.length).toBeLessThan(clusters.length / 8);
  });

  test("most multi-airport groups have resolved by 4x", () => {
    const multi = clusters.filter((c) => c.members.length > 1);
    expect(multi.length).toBeGreaterThan(100);
    const resolved = multi.filter((c) => shouldSplit(c.radiusDeg, atZoom(4)));
    expect(resolved.length).toBeGreaterThan(multi.length / 2);
  });

  test("the lens never draws more dots than there are airports", () => {
    for (const zoom of [1, 2, 3, 4, 6, 8]) {
      const nodes = clusters.reduce(
        (s, c) => s + (shouldSplit(c.radiusDeg, atZoom(zoom)) ? c.members.length : 1),
        0,
      );
      expect(nodes).toBeLessThanOrEqual(AIRPORTS.length);
    }
  });
});
