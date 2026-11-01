import { describe, expect, test } from "bun:test";
import { ridgePath, starPlane } from "../src/domain/demo-depth";

/* The demo stage's depth layers are generated, never random — the same sky
 * for SSR, hydration and every sent link. These pin the contract: bounds,
 * determinism, and silhouettes that actually close. */

describe("demo depth layers", () => {
  test("starPlane is deterministic and bounded", () => {
    const a = starPlane(7, 24, 58);
    const b = starPlane(7, 24, 58);
    expect(a).toEqual(b);
    expect(a.length).toBe(24);
    for (const s of a) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(100);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(58);
      expect(s.r).toBeGreaterThan(0);
      expect(s.o).toBeGreaterThanOrEqual(0.3);
      expect(s.o).toBeLessThanOrEqual(0.9);
    }
  });

  test("different seeds give different skies", () => {
    expect(starPlane(7, 24)).not.toEqual(starPlane(8, 24));
  });

  test("ridgePath draws a closed silhouette with a jagged top edge", () => {
    const d = ridgePath(97, 8, 0.85);
    expect(d).toMatch(/^M 0 40 /);
    expect(d.endsWith("L 100 40 Z")).toBe(true);
    // peaks + 1 top-edge points, all inside the 100×40 box above the floor.
    const pts = [...d.matchAll(/L ([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(pts.length).toBe(10); // 9 ridge points + the closing floor corner
    const ridge = pts.slice(0, 9);
    for (const [, y] of ridge) {
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThanOrEqual(30);
    }
    // A ridge that never climbs is a straight line — the seed must vary it.
    const ys = new Set(ridge.map(([, y]) => y));
    expect(ys.size).toBeGreaterThan(3);
    expect(ridgePath(97, 8, 0.85)).toBe(d);
    expect(ridgePath(41, 5, 0.4)).not.toBe(d);
  });
});
