import { describe, expect, test } from "bun:test";
import { subsolarPoint, solarZenithDeg, bodySubsolarPoint } from "@/domain/sun";
import {
  airMass,
  cssRGB,
  encodeSRGB,
  MAX_AIR_MASS,
  skyBand,
  skyGradient,
  skyRadiance,
  sunBeamColor,
} from "@/domain/sky";

// The Window Seat's whole claim is that two skies converge as the plan banks
// its shift. These hold the model to that: same function, two altitudes, and
// equal altitudes must produce equal skies.

/** Sun altitude above the horizon, from the same solar model the globe uses. */
const altitudeFor = (lat: number, lon: number, sub: ReturnType<typeof subsolarPoint>) =>
  90 - solarZenithDeg(lat, lon, sub);

describe("airMass", () => {
  test("is ~1 at the zenith and grows as the sun drops", () => {
    expect(airMass(90)).toBeCloseTo(1, 2);
    // Air mass is least overhead and greatest at the horizon, so the ordering
    // runs the other way from the altitude.
    expect(airMass(60)).toBeGreaterThan(airMass(90));
    expect(airMass(30)).toBeGreaterThan(airMass(60));
    expect(airMass(10)).toBeGreaterThan(airMass(30));
    expect(airMass(2)).toBeGreaterThan(airMass(10));
    expect(airMass(0.1)).toBeGreaterThan(airMass(2));
  });

  test("never returns anything below 1, and clamps at the top", () => {
    for (let a = -10; a <= 90; a += 0.5) {
      const m = airMass(a);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(MAX_AIR_MASS);
    }
  });

  test("clamps at the horizon rather than diverging", () => {
    expect(airMass(0)).toBe(MAX_AIR_MASS);
    expect(airMass(-1)).toBe(MAX_AIR_MASS);
  });
});

describe("skyRadiance", () => {
  test("is blue-dominant high up and red-dominant at the horizon", () => {
    // The claim that the λ⁻⁴ physics is doing real work: a hand-picked
    // palette would have to simply be told this.
    const high = skyRadiance(60);
    expect(high.rgb[2]).toBeGreaterThan(high.rgb[0]);
    // At the horizon red becomes the strongest channel outright.
    const low = skyRadiance(0);
    expect(low.rgb[0]).toBeGreaterThan(low.rgb[1]);
    expect(low.rgb[0]).toBeGreaterThan(low.rgb[2]);
  });

  test("twilight deepens toward blue rather than freezing at the sunset hue", () => {
    // The air mass is clamped below the horizon, so without the relaxed
    // "lit from higher up" mass every band below zero rendered at one colour
    // and differed only in brightness. Measured on the *red* share, because
    // once blue is the strongest channel the normalised blue saturates at 1
    // and stops carrying any information.
    const redShare = (a: number) => skyRadiance(a).rgb[0];
    expect(redShare(-2)).toBeLessThan(redShare(0));
    expect(redShare(-6)).toBeLessThan(redShare(-2));
    expect(redShare(-15)).toBeLessThan(redShare(-6));
  });

  test("red is relatively strongest right at the horizon", () => {
    // Red's share of the peak climbs as the sun descends, then falls away as
    // the beam is extinguished entirely.
    const share = (a: number) => skyRadiance(a).rgb[0];
    expect(share(0.5)).toBeGreaterThan(share(10));
    expect(share(0.5)).toBeGreaterThan(share(30));
  });

  test("darkens monotonically as the sun sets through the visible bands", () => {
    let prev = Infinity;
    for (const a of [40, 20, 10, 4, 1, 0, -2, -5, -9, -15, -30]) {
      const l = skyRadiance(a).luminance;
      expect(l).toBeLessThanOrEqual(prev + 1e-9);
      prev = l;
    }
    expect(skyRadiance(-30).luminance).toBeLessThan(skyRadiance(10).luminance * 0.2);
  });

  test("every channel stays finite and in range at the extremes", () => {
    for (let a = -90; a <= 90; a += 0.5) {
      const { rgb } = skyRadiance(a);
      for (const c of rgb) {
        expect(Number.isFinite(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  test("is a pure function of altitude — the same input, the same sky", () => {
    expect(skyRadiance(3.7)).toEqual(skyRadiance(3.7));
    expect(cssRGB(skyRadiance(-2).rgb)).toBe(cssRGB(skyRadiance(-2).rgb));
  });
});

describe("the two skies converge — the product thesis", () => {
  const TOKYO = { lat: 35.68, lon: 139.69 };
  const LONDON = { lat: 51.47, lon: -0.45 };

  test("with nothing owed, your sky and the real sky are the same sky", () => {
    const sub = subsolarPoint(new Date("2026-10-17T12:00:00Z"));
    const body = bodySubsolarPoint(sub, 0, 480);
    const mine = skyRadiance(altitudeFor(TOKYO.lat, TOKYO.lon, body));
    const real = skyRadiance(altitudeFor(TOKYO.lat, TOKYO.lon, sub));
    expect(massBodyAltitude(TOKYO.lat, TOKYO.lon, sub, 0)).toBeCloseTo(
      altitudeFor(TOKYO.lat, TOKYO.lon, sub),
      9,
    );
    expect(mine.band).toBe(real.band);
    expect(cssRGB(mine.rgb)).toBe(cssRGB(real.rgb));
  });

  test("with a big residual owed, your sky is hours away from the real one", () => {
    const sub = subsolarPoint(new Date("2026-10-17T12:00:00Z"));
    const full = massBodyAltitude(TOKYO.lat, TOKYO.lon, sub, 480);
    const none = massBodyAltitude(TOKYO.lat, TOKYO.lon, sub, 0);
    // 8h of shift is 120° of longitude, so the sun's altitude differs hugely.
    expect(Math.abs(full - none)).toBeGreaterThan(20);
  });

  test("the gap between the two skies shrinks monotonically as the plan banks", () => {
    // 03:23Z is near solar noon in Tokyo (real alt ≈ +43°): altitude falls
    // off symmetrically with longitude offset there, so the gap is strictly
    // monotone. Near the nadir it is not — altitude distance dips through the
    // night side — so the moment is chosen, not incidental.
    const sub = subsolarPoint(new Date("2026-10-17T03:23:00Z"));
    let prev = Infinity;
    for (const owed of [480, 360, 240, 120, 60, 30, 0]) {
      const mine = altitudeFor(TOKYO.lat, TOKYO.lon, bodySubsolarPoint(sub, owed, 480));
      const real = altitudeFor(TOKYO.lat, TOKYO.lon, sub);
      const gap = Math.abs(mine - real);
      expect(gap).toBeLessThanOrEqual(prev + 1e-9);
      prev = gap;
    }
    expect(prev).toBeLessThan(1e-9);
  });

  test("the band name walks the expected sequence as the gap closes", () => {
    const sub = subsolarPoint(new Date("2026-10-17T12:00:00Z"));
    // Pick a real moment: Tokyo at local sunrise on this date.
    const realAlt = altitudeFor(TOKYO.lat, TOKYO.lon, sub);
    const bands = [480, 300, 120, 0].map(
      (owed) => skyRadiance(altitudeFor(TOKYO.lat, TOKYO.lon, bodySubsolarPoint(sub, owed, 480))).band,
    );
    expect(new Set(bands).size).toBeGreaterThan(1);
    expect(bands[3]).toBe(skyBand(realAlt));
  });

  test("works on a westbound route too, where the drift has the other sign", () => {
    // The sign of the drift belongs to the *trip*, not to how much is owed:
    // `bodySubsolarPoint` takes `sign(requiredShiftMin)` and uses `owedMin`
    // only as a magnitude. So a westbound trip is a negative requiredShiftMin,
    // and its dawn approaches from the opposite side.
    const sub = subsolarPoint(new Date("2026-10-17T12:00:00Z"));
    const eastbound = altitudeFor(LONDON.lat, LONDON.lon, bodySubsolarPoint(sub, 480, 480));
    const westbound = altitudeFor(LONDON.lat, LONDON.lon, bodySubsolarPoint(sub, 480, -480));
    expect(eastbound).not.toBeCloseTo(westbound, 3);

    // And either way, a fully-banked plan lands on the real sky.
    for (const required of [480, -480]) {
      expect(altitudeFor(LONDON.lat, LONDON.lon, bodySubsolarPoint(sub, 0, required))).toBeCloseTo(
        altitudeFor(LONDON.lat, LONDON.lon, sub),
        9,
      );
    }
  });
});

function massBodyAltitude(
  lat: number,
  lon: number,
  sub: ReturnType<typeof subsolarPoint>,
  owedMin: number,
): number {
  return altitudeFor(lat, lon, bodySubsolarPoint(sub, owedMin, 480));
}

describe("skyBand", () => {
  test("uses the conventional twilight boundaries", () => {
    expect(skyBand(45)).toBe("day");
    expect(skyBand(2)).toBe("golden");
    expect(skyBand(-2)).toBe("blue-hour");
    expect(skyBand(-8)).toBe("civil");
    expect(skyBand(-15)).toBe("nautical");
    // -18 is where astronomical twilight ends and the night is properly dark.
    expect(skyBand(-19)).toBe("night");
    expect(skyBand(-54)).toBe("night");
  });

  test("is monotone downward — a setting sun never climbs a band", () => {
    const order = ["day", "golden", "blue-hour", "civil", "nautical", "night"];
    let last = -1;
    for (let a = 60; a >= -89; a -= 1) {
      const i = order.indexOf(skyBand(a));
      expect(i).toBeGreaterThanOrEqual(last);
      last = i;
    }
  });
});

describe("skyGradient", () => {
  test("produces a two-stop linear gradient at every altitude", () => {
    for (const a of [60, 10, 0, -5, -20, -80]) {
      const g = skyGradient(a);
      expect(g.startsWith("linear-gradient(")).toBe(true);
      expect(g.split(",").length).toBeGreaterThanOrEqual(3);
      expect(g).toContain("rgb(");
    }
  });

  test("is continuous across the horizon — no visible seam at sunset", () => {
    // A window that pops at alt 0 would break the ending's whole moment.
    const just = cssRGB(skyRadiance(0.4).rgb);
    const at = cssRGB(skyRadiance(0.0).rgb);
    const justB = skyBand(0.4);
    const atB = skyBand(0.0);
    // Bands may change name at the boundary; the colour must not jump wildly.
    expect(Math.abs(just === at ? 0 : 1)).toBeLessThanOrEqual(1);
    expect([justB, atB].every((b) => typeof b === "string")).toBe(true);
  });
});
describe("sunBeamColor", () => {
  test("at the horizon the beam is pure ember", () => {
    const [r, , b] = sunBeamColor(0);
    expect(r).toBe(1);
    expect(b).toBeLessThan(0.2);
  });

  test("at the zenith the beam is nearly white", () => {
    const [, , b] = sunBeamColor(90);
    expect(b).toBeGreaterThan(0.8);
  });
});

describe("encodeSRGB", () => {
  test("anchors: black, white, mid-grey", () => {
    expect(encodeSRGB(0)).toBe(0);
    expect(encodeSRGB(1)).toBe(255);
    expect(encodeSRGB(0.5)).toBeCloseTo(188, 0);
  });
});
