import { describe, expect, test } from "bun:test";
import {
  bodySubsolarPoint,
  equationOfTimeMin,
  isDaylight,
  solarDeclination,
  solarClockMin,
  solarZenithDeg,
  subsolarPoint,
  terminatorCrossings,
  terminatorLat,
  wrapLon,
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

describe("solar clock", () => {
  test("it is noon under the sun and six hours either side at the crossings", () => {
    const sub = subsolarPoint(at("2026-10-15T12:00:00Z"));
    expect(solarClockMin(sub.lon, sub)).toBe(720);
    expect(solarClockMin(wrapLon(sub.lon - 90), sub)).toBe(360);
    expect(solarClockMin(wrapLon(sub.lon + 90), sub)).toBe(1080);
  });

  test("and it reads across the antimeridian, not around it", () => {
    // 170°E to 170°W is 20° east, so twenty minutes past the sun's noon —
    // not 22 hours.
    const sub: SubsolarPoint = { lon: 170, lat: 0 };
    expect(solarClockMin(-170, sub)).toBe(800);
  });
});

// The hero panel draws its beam where the day/night line crosses the latitude
// the traveller is standing on, so the crossing has to be on the line.
describe("terminator crossings", () => {
  const oct = subsolarPoint(at("2026-10-15T12:00:00Z"));
  const dec = subsolarPoint(decemberSolstice);

  test("both ends of the line, at 90° of zenith angle", () => {
    const crossings = terminatorCrossings(51.5, oct);
    expect(crossings).toHaveLength(2);
    for (const c of crossings) {
      expect(solarZenithDeg(c.lat, c.lon, oct)).toBeCloseTo(90, 4);
    }
  });

  test("dawn first, then dusk, mirrored either side of the sun", () => {
    const [dawn, dusk] = terminatorCrossings(51.5, oct);
    expect(dawn.clockMin).toBeLessThan(720);
    expect(dusk.clockMin).toBeGreaterThan(720);
    expect(wrapLon(dawn.lon - oct.lon)).toBeCloseTo(-wrapLon(dusk.lon - oct.lon), 6);
  });

  test("an equinox rises at six solar and sets at eighteen, wherever you are", () => {
    const equinox: SubsolarPoint = { lon: 20, lat: 0 };
    const [dawn, dusk] = terminatorCrossings(51.5, equinox);
    expect(dawn.lon).toBeCloseTo(-70, 6);
    expect(dawn.clockMin).toBeCloseTo(360, 6);
    expect(dusk.lon).toBeCloseTo(110, 6);
    expect(dusk.clockMin).toBeCloseTo(1080, 6);
  });

  test("October shortens the London day and barely touches Singapore's", () => {
    // 51.5°N with the sun 9° south pushes dawn well past six solar; 1.3°N is
    // within minutes of it all year.
    expect(terminatorCrossings(51.5, oct)[0].clockMin).toBeGreaterThan(380);
    expect(Math.abs(terminatorCrossings(1.3, oct)[0].clockMin - 360)).toBeLessThan(5);
  });

  test("polar day and polar night get no sunrise to draw", () => {
    // |cos H| > 1 is the honest "the sun never meets the horizon here", not a
    // fabricated dawn the panel could put a beam on.
    expect(terminatorCrossings(78, dec)).toEqual([]);
    expect(terminatorCrossings(-78, dec)).toEqual([]);
    expect(terminatorCrossings(90, oct)).toEqual([]);
  });
});

// design-vision.md §2: the ghost is the body's own sun — behind the destination
// dawn eastbound — and each locked day drags it onto the real one.
describe("the body's sub-solar point", () => {
  const oct = subsolarPoint(at("2026-10-15T12:00:00Z"));
  const EAST = -480; // LHR → HND: eight hours to advance, signed negative

  test("an eastbound body sits 15° an hour behind the real sun", () => {
    const body = bodySubsolarPoint(oct, 480, EAST);
    expect(wrapLon(body.lon - oct.lon)).toBeCloseTo(120, 6);
    // Same declination: the ghost is the same line, only offset in longitude.
    expect(body.lat).toBe(oct.lat);
  });

  test("a westbound body leads it", () => {
    expect(wrapLon(bodySubsolarPoint(oct, 300, 300).lon - oct.lon)).toBeCloseTo(-75, 6);
  });

  test("nothing owed, no second line at all", () => {
    expect(bodySubsolarPoint(oct, 0, EAST)).toEqual(oct);
  });

  test("the drift never swings past the trip's own gap", () => {
    const fullGap = (Math.abs(EAST) / 60) * 15;
    for (const owed of [0, 90, 240, 480]) {
      const drift = wrapLon(bodySubsolarPoint(oct, owed, EAST).lon - oct.lon);
      expect(Math.abs(drift)).toBeLessThanOrEqual(fullGap + 1e-9);
    }
  });

  test("an over-owed day stops at the whole trip", () => {
    // The curve's span is capped by the trip itself: owe sixteen hours to an
    // eight-hour shift and the ghost sits on the far side, not past it.
    expect(wrapLon(bodySubsolarPoint(oct, 960, EAST).lon - oct.lon)).toBeCloseTo(120, 6);
    expect(wrapLon(bodySubsolarPoint(oct, -960, EAST).lon - oct.lon)).toBeCloseTo(120, 6);
    expect(wrapLon(bodySubsolarPoint(oct, 600, 300).lon - oct.lon)).toBeCloseTo(-75, 6);
  });
});
