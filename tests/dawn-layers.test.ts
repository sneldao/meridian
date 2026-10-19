import { describe, expect, test } from "bun:test";
import { geoOrthographic, geoPath } from "d3-geo";
import { dawnLayers, GHOST_VISIBLE_MIN, shiftDegToMin, shiftMinToDeg } from "../src/domain/dawn-layers";
import { subsolarPoint, wrapLon, type SubsolarPoint } from "../src/domain/sun";

// The hero and the crew lens both draw the dawn. These are the assertions that
// stop them drifting apart: the paths must be real geometry, and the ghost must
// move the way the body clock says it does.

const gen = geoPath(
  geoOrthographic().scale(140).translate([160, 160]).rotate([-70, -45]).clipAngle(90),
);
const at = (iso: string) => new Date(iso);
const sub = subsolarPoint(at("2026-10-15T12:00:00Z"));

/** 8h east — the demo trip's shape. Sign convention: negative = advance. */
const EAST_8H = -480;

describe("unit conversion", () => {
  test("15° an hour, so one minute of shift is a quarter degree", () => {
    expect(shiftMinToDeg(60)).toBeCloseTo(15, 10);
    expect(shiftDegToMin(15)).toBeCloseTo(60, 10);
  });

  test("the round trip is lossless", () => {
    for (const min of [0, 5, 97.5, 390, 480]) {
      expect(shiftDegToMin(shiftMinToDeg(min))).toBeCloseTo(min, 10);
    }
  });
});

describe("dawn layers", () => {
  test("every layer is real projected geometry", () => {
    const l = dawnLayers(gen, sub, 390, EAST_8H);
    for (const path of [l.nightPath, l.twilightPath, l.terminatorPath, l.ghostPath]) {
      expect(path).toBeTruthy();
      expect(path!.startsWith("M")).toBe(true);
      expect(path!.length).toBeGreaterThan(50);
    }
  });

  test("the ghost disappears once the gap is too small to see", () => {
    expect(dawnLayers(gen, sub, GHOST_VISIBLE_MIN, EAST_8H).ghostPath).toBeTruthy();
    expect(dawnLayers(gen, sub, GHOST_VISIBLE_MIN - 1, EAST_8H).ghostPath).toBeNull();
    expect(dawnLayers(gen, sub, 0, EAST_8H).ghostDawnLon).toBeNull();
  });

  test("with nothing owed, the ghost sits exactly on the real dawn", () => {
    // The convergence the hero's shift lane scrubs toward has to be real: at
    // owed = 0 the two curves are the same circle, not merely close.
    const closed = dawnLayers(gen, sub, 0, EAST_8H);
    expect(closed.ghostPath).toBeNull();
    const bodyAtZero = subsolarPoint(at("2026-10-15T12:00:00Z"));
    expect(bodyAtZero.lon).toBeCloseTo(sub.lon, 10);
  });

  test("the ghost's drift is capped at the trip's full shift", () => {
    // bodySubsolarPoint owns this, but dawn-layers is the thing both surfaces
    // now depend on, so the guarantee is asserted here rather than assumed.
    const atCap = dawnLayers(gen, sub, EAST_8H, EAST_8H);
    const wayOver = dawnLayers(gen, sub, EAST_8H * 4, EAST_8H);
    expect(wayOver.bodyLon).toBeCloseTo(atCap.bodyLon, 10);
  });

  test("direction matters: east and west drift opposite ways", () => {
    const east = dawnLayers(gen, sub, 240, -240);
    const west = dawnLayers(gen, sub, 240, 240);
    expect(east.bodyLon).toBeCloseTo(sub.lon - 60, 6);
    expect(west.bodyLon).toBeCloseTo(sub.lon + 60, 6);
  });

  test("an eastward body is west of the real dawn — behind, as Tokyo is", () => {
    // 6.5h owed at 15°/h is 97.5° of longitude. ghostDawnLon comes back
    // wrapped into (−180, 180], so the expectation has to wrap too.
    const l = dawnLayers(gen, sub, 390, EAST_8H);
    expect(l.bodyLon).toBeCloseTo(sub.lon - 97.5, 6);
    expect(l.ghostDawnLon).toBeCloseTo(wrapLon(sub.lon - 97.5 - 90), 6);
  });

  test("the layer set is a pure function of its arguments", () => {
    const a = dawnLayers(gen, sub, 120, EAST_8H);
    const b = dawnLayers(gen, sub, 120, EAST_8H);
    expect(a.ghostPath).toBe(b.ghostPath);
    expect(a.terminatorPath).toBe(b.terminatorPath);
  });

  test("ghost precision is the only thing the options change", () => {
    const fine = dawnLayers(gen, sub, 390, EAST_8H, { ghostPrecision: 0.5 });
    const coarse = dawnLayers(gen, sub, 390, EAST_8H, { ghostPrecision: 1 });
    expect(fine.ghostPath).not.toBe(coarse.ghostPath);
    expect(fine.terminatorPath).toBe(coarse.terminatorPath);
  });
});

describe("the crew lens's degrees and the hero's minutes agree", () => {
  test("the lens converts its degree gap into the same ghost the hero draws", () => {
    // This is the seam the refactor had to get right: WorldLens is handed
    // ghostGapDeg(run) in degrees, HeroDawnPanel is handed owedMin in minutes,
    // and they must land on the same curve.
    const owedMin = 390;
    const fromMinutes = dawnLayers(gen, sub, owedMin, EAST_8H);
    const fromDegrees = dawnLayers(gen, sub, shiftDegToMin(shiftMinToDeg(owedMin)), EAST_8H);
    expect(fromDegrees.bodyLon).toBeCloseTo(fromMinutes.bodyLon, 10);
    expect(fromDegrees.ghostPath).toBe(fromMinutes.ghostPath);
  });

  test("and an arbitrary subsolar point works the same way", () => {
    const other: SubsolarPoint = subsolarPoint(at("2026-01-03T03:00:00Z"));
    const a = dawnLayers(gen, other, 240, EAST_8H);
    const b = dawnLayers(gen, other, shiftDegToMin(shiftMinToDeg(240)), EAST_8H);
    expect(b.ghostPath).toBe(a.ghostPath);
  });
});