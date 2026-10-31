import { describe, expect, test } from "bun:test";
import { stageSky, stageSkyFor, stageSkyVars } from "@/domain/stage-sky";
import { buildTrip } from "../src/domain/fixtures";
import { solarZenithDeg, subsolarPoint } from "@/domain/sun";

// The stage sky is the Window Seat's model projected onto ink: same function
// of the body sun's altitude, clamped so paper text survives on the band.

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
      expect(Math.max(r, g, b)).toBeLessThanOrEqual(199); // round(0.78 * 255)
    }
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

  test("a real date lands the three stage variables", () => {
    const vars = stageSkyFor(trip, -270, new Date("2026-10-17T12:00:00Z")) as Record<
      string,
      string
    >;
    for (const key of ["--stage-horizon", "--stage-horizon-h", "--stage-origin"]) {
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
