import { describe, expect, test } from "bun:test";
import {
  equationOfTimeMin,
  isDaylight,
  solarDeclination,
  solarZenithDeg,
  subsolarPoint,
  terminatorLat,
  type SubsolarPoint,
} from "../src/domain/sun";

const at = (iso: string) => new Date(iso);
const juneSolstice = at("2026-06-21T12:00:00Z");
const decemberSolstice = at("2026-12-21T12:00:00Z");

describe("solar declination", () => {
  test("the sun stands still at 23.44° on the solstices", () => {
    expect(solarDeclination(juneSolstice)).toBeCloseTo(23.44, 0);
    expect(solarDeclination(decemberSolstice)).toBeCloseTo(-23.44, 0);
  });

  test("and crosses the equator near the equinoxes", () => {
    expect(Math.abs(solarDeclination(at("2026-03-20T12:00:00Z")))).toBeLessThan(1);
    expect(Math.abs(solarDeclination(at("2026-09-23T12:00:00Z")))).toBeLessThan(1);
  });

  test("mid-October 2026 has the sun south of the equator", () => {
    const dec = solarDeclination(at("2026-10-15T12:00:00Z"));
    expect(dec).toBeLessThan(-7);
    expect(dec).toBeGreaterThan(-11);
  });
});

describe("sub-solar point", () => {
  test("the equation of time moves the sun off the naive 15°/hour longitude", () => {
    // Early November and mid-February are the extremes: ±16 minutes, ±4°.
    expect(equationOfTimeMin(at("2026-11-03T12:00:00Z"))).toBeGreaterThan(13);
    expect(equationOfTimeMin(at("2026-02-11T12:00:00Z"))).toBeLessThan(-13);
    // Mid-October runs ~14 min ahead, so at 12:00 UTC the sun has passed
    // Greenwich and sits a few degrees west.
    const oct = subsolarPoint(at("2026-10-15T12:00:00Z"));
    expect(oct.lon).toBeLessThan(-1);
    expect(oct.lon).toBeGreaterThan(-6);
    // Mid-February is 14 min behind: the sun has not reached Greenwich yet.
    expect(subsolarPoint(at("2026-02-11T12:00:00Z")).lon).toBeGreaterThan(1);
  });

  test("the sun is overhead there, and 90° away is the terminator", () => {
    const sub = subsolarPoint(juneSolstice);
    expect(solarZenithDeg(sub.lat, sub.lon, sub)).toBeLessThan(0.01);
    expect(terminatorLat(sub.lon + 90, sub)).toBeCloseTo(0, 1);
  });
});

describe("polar day and night", () => {
  test("the north pole is lit in June and dark in December", () => {
    expect(isDaylight(90, 0, juneSolstice)).toBe(true);
    expect(isDaylight(90, 0, decemberSolstice)).toBe(false);
  });

  test("the south pole is the other way round", () => {
    expect(isDaylight(-90, 0, juneSolstice)).toBe(false);
    expect(isDaylight(-90, 0, decemberSolstice)).toBe(true);
  });

  test("the polar night edge lands where it should on 15 Oct 2026", () => {
    const day = at("2026-10-15T12:00:00Z");
    // Declination ~-8.9°, so the line sits near 81°N on the sun's meridian.
    expect(isDaylight(79, 0, day)).toBe(true);
    expect(isDaylight(83, 0, day)).toBe(false);
  });

  test("day and night still split the globe in half", () => {
    // Independent of any drawing: sample the sphere, weight by cos(lat).
    const fraction = (date: Date) => {
      let lit = 0;
      let total = 0;
      for (let lat = -88; lat <= 88; lat += 2) {
        for (let lon = -178; lon <= 178; lon += 2) {
          const w = Math.cos((lat * Math.PI) / 180);
          total += w;
          if (isDaylight(lat, lon, date)) lit += w;
        }
      }
      return lit / total;
    };
    for (const date of [juneSolstice, decemberSolstice, at("2026-10-15T12:00:00Z")]) {
      expect(fraction(date)).toBeCloseTo(0.5, 1);
    }
  });
});

describe("terminator latitude", () => {
  test("June: the curve reaches the Arctic and Antarctic circles", () => {
    const sub = subsolarPoint(juneSolstice);
    expect(terminatorLat(sub.lon, sub)).toBeCloseTo(-66.56, 0);
    expect(terminatorLat(sub.lon + 180, sub)).toBeCloseTo(66.56, 0);
    expect(terminatorLat(sub.lon + 90, sub)).toBeCloseTo(0, 0);
  });

  test("December mirrors it", () => {
    const sub = subsolarPoint(decemberSolstice);
    expect(terminatorLat(sub.lon, sub)).toBeCloseTo(66.56, 0);
    expect(terminatorLat(sub.lon + 180, sub)).toBeCloseTo(-66.56, 0);
  });

  test("the equinoxes degenerate to a meridian pair", () => {
    // With no declination the formula is a pole on each side of the sun: the
    // whole sunward hemisphere is lit, which is the limit as δ -> 0+.
    const sub: SubsolarPoint = { lon: 0, lat: 0 };
    expect(terminatorLat(45, sub)).toBe(-90);
    expect(terminatorLat(-45, sub)).toBe(-90);
    expect(terminatorLat(120, sub)).toBe(90);
    expect(terminatorLat(-120, sub)).toBe(90);
    // And the two meridians where the pair actually is.
    expect(terminatorLat(90, sub)).toBe(0);
    expect(terminatorLat(-90, sub)).toBe(0);
  });
});
