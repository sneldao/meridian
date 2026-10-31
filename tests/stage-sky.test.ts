import { describe, expect, test } from "bun:test";
import { stageSky, stageSkyFor, stageSkyVars } from "@/domain/stage-sky";
import { buildTrip } from "../src/domain/fixtures";
import { solarZenithDeg, subsolarPoint } from "@/domain/sun";

// The stage sky is the Window Seat's model projected onto ink: the horizon
// band is the transmitted beam (ember low, near-white gold high), the zenith
// stop is the scattered sky tinted into the stage's ink.

const parseChannels = (rgba: string): number[] =>
  rgba
    .replace(/rgba?\(|\)/g, "")
    .split(",")
    .map((s) => parseFloat(s));

const horizonHeightNum = (h: string) => parseFloat(h.replace("%", ""));

describe("stageSky", () => {
  test("horizon band rises monotonically with the body sun, clamped above +6°", () => {
    const hs = [-30, -12, 0, 10].map(
      (alt) => horizonHeightNum(stageSky(alt, 0, -540).horizonHeight),
    );
    expect(hs[1]).toBeGreaterThan(hs[0]);
    expect(hs[2]).toBeGreaterThan(hs[1]);
    expect(hs[3]).toBeGreaterThan(hs[2]);
    // Both at the +6° knee of t → the same clamped height.
    expect(stageSky(6, 0, -540).horizonHeight).toBe(stageSky(30, 0, -540).horizonHeight);
  });

  test("horizon band luminance stays under the text-contrast cap", () => {
    for (let alt = -30; alt <= 60; alt += 5) {
      const [r, g, b] = parseChannels(stageSky(alt, 0, -540).horizon);
      expect(Math.max(r, g, b)).toBeLessThanOrEqual(199);
    }
  });

  test("the band is the beam: warm at the horizon, near-neutral gold by day", () => {
    for (const alt of [-12, -6, -3, 0, 3, 6]) {
      const [r, g, b] = parseChannels(stageSky(alt, 0, -540).horizon);
      expect(r).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(b);
      expect(r).toBeGreaterThan(b + 20);
    }
    const [r, g, b] = parseChannels(stageSky(30, 0, -540).horizon);
    expect(r).toBeGreaterThanOrEqual(g);
    expect(g).toBeGreaterThanOrEqual(b);
    expect(r - b).toBeLessThan(60);
  });

  test("night state: a deep-night body sun leaves a faint low ember band", () => {
    const sky = stageSky(-25, 360, -540);
    expect(sky.horizonHeight).toBe("10%");
    expect(parseChannels(sky.horizon)[3]).toBeCloseTo(0.26, 3);
    expect(parseChannels(sky.horizonFloor)[3]).toBeCloseTo(0.06, 3);
    // The haze is the band's own colour, dimmer.
    expect(sky.horizonFloor.slice(0, sky.horizonFloor.lastIndexOf(","))).toBe(
      sky.horizon.slice(0, sky.horizon.lastIndexOf(",")),
    );
  });

  test("the zenith stop is pure ink at night and lets sky through by day", () => {
    expect(stageSky(-25, 0, -540).zenith).toBe("rgb(12, 18, 32)");
    expect(stageSky(30, 0, -540).zenith).not.toBe("rgb(12, 18, 32)");
  });

  test("origin residue is proportional to the shift still owed", () => {
    const alphaOf = (sky: ReturnType<typeof stageSky>) => parseChannels(sky.origin)[3];
    expect(alphaOf(stageSky(0, 0, -540))).toBe(0);
    expect(alphaOf(stageSky(0, -540, 0))).toBe(0);
    expect(alphaOf(stageSky(0, -540, -540))).toBeCloseTo(0.22, 3);
    // Owed beyond the required shift clamps rather than oversaturating.
    expect(alphaOf(stageSky(0, -720, -540))).toBeLessThanOrEqual(0.22);
  });
});

describe("stageSkyFor", () => {
  const trip = buildTrip("LHR", "HND", "2026-10-20");

  test("null date → no variables (CSS defaults, no hydration mismatch)", () => {
    expect(stageSkyFor(trip, 0, null)).toEqual({});
  });

  test("a real date lands the five stage variables", () => {
    const vars = stageSkyFor(trip, -270, new Date("2026-10-17T12:00:00Z")) as Record<
      string,
      string
    >;
    for (const key of [
      "--stage-horizon",
      "--stage-horizon-h",
      "--stage-horizon-floor",
      "--stage-ink-2",
      "--stage-origin",
    ]) {
      expect(typeof vars[key]).toBe("string");
    }
  });

  test("with nothing owed, the body sun IS the real sun", () => {
    // The convergence claim the whole ending rests on: at owedMin 0 the stage
    // must read the same altitude the Window Seat draws for the destination.
    const date = new Date("2026-10-19T04:30:00Z");
    const realAlt =
      90 - solarZenithDeg(trip.destination.lat, trip.destination.lon, subsolarPoint(date));
    const vars = stageSkyFor(trip, 0, date);
    // stageSkyFor hides the altitude inside its vars, so parity is pinned on
    // the exact var set the real altitude produces — same function, same sky.
    expect(vars).toEqual(stageSkyVars(stageSky(realAlt, 0, trip.requiredShiftMin)));
  });
});
