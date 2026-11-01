import { describe, expect, test } from "bun:test";
import { leanFor, smearFor, snapTarget } from "../src/domain/momentum";

describe("smearFor", () => {
  test("zero below the dead zone — nothing smears at rest", () => {
    for (const v of [0, 10, 39.9, -39]) {
      const s = smearFor(v);
      expect(s.length).toBe(0);
      expect(s.ghostOpacity).toEqual([0, 0, 0]);
      expect(s.scaleAlong).toBe(1);
      expect(s.scaleAcross).toBe(1);
    }
  });
  test("grows with speed and caps", () => {
    const slow = smearFor(200);
    const fast = smearFor(900);
    expect(slow.length).toBeGreaterThan(0);
    expect(fast.length).toBeGreaterThan(slow.length);
    expect(smearFor(5000).length).toBeLessThanOrEqual(120);
  });
  test("ghosts fade in with speed, never above their caps", () => {
    const s = smearFor(800);
    expect(s.ghostOpacity[0]).toBeCloseTo(0.25, 3);
    const quarter = smearFor(200);
    expect(quarter.ghostOpacity[0]).toBeCloseTo(0.25 * 0.25, 3);
    expect(smearFor(10000).ghostOpacity[0]).toBeLessThanOrEqual(0.25);
  });
  test("squash-and-stretch conserves area", () => {
    const s = smearFor(2000);
    expect(s.scaleAlong).toBeGreaterThan(1);
    expect(s.scaleAcross).toBeCloseTo(1 / s.scaleAlong, 6);
    expect(smearFor(100000).scaleAlong).toBeLessThanOrEqual(1.22 + 1e-9);
  });
});

describe("snapTarget", () => {
  const edges = [300, 360, 720];
  test("a window edge inside the magnet wins over the grid", () => {
    expect(snapTarget(303, edges)).toBe(300); // 3 away < 20 — magnet, not 305
    expect(snapTarget(342, edges)).toBe(360); // 18 to 360 is within the magnet
  });
  test("outside the magnet the 5-min grid wins", () => {
    expect(snapTarget(328, edges)).toBe(330);
    expect(snapTarget(100, edges)).toBe(100);
    expect(snapTarget(102, edges)).toBe(100);
    expect(snapTarget(103, edges)).toBe(105);
  });
  test("clamps into the day", () => {
    expect(snapTarget(-10, edges)).toBe(0);
    expect(snapTarget(2000, edges)).toBe(1439);
  });
  test("no edges → pure grid", () => {
    expect(snapTarget(303, [])).toBe(305);
  });
});

describe("leanFor", () => {
  test("proportional and capped", () => {
    expect(leanFor(0)).toBe(0);
    expect(leanFor(240)).toBe(-2);
    expect(leanFor(-240)).toBe(2);
    expect(leanFor(9999)).toBe(-8);
    expect(leanFor(-9999)).toBe(8);
  });
});
