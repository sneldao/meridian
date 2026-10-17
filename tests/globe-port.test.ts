import { describe, expect, test } from "bun:test";
import { geoDistance, geoOrthographic } from "d3-geo";
import { Vector3 } from "three";
import { isDaylight, solarZenithDeg, subsolarPoint, bodySubsolarPoint } from "@/domain/sun";
import { dawnLayers, shiftMinToDeg, GHOST_VISIBLE_MIN } from "@/domain/dawn-layers";
import {
  lonLatToVec3,
  projectOrthographic,
  sunDirection,
  viewBasis,
  vec3ToLonLat,
} from "@/lib/globe/spherical";

// The WebGL globe is only allowed to exist if it draws the same world the SVG
// globe draws. These tests are that proof, and they are numeric rather than
// visual: a screenshot cannot tell you a terminator is off by 0.3°, but an
// assertion can. If the shader and `dawn-layers` ever stop agreeing, these go
// red before anyone notices on a 320px disc.

const SAMPLE_POINTS: [number, number][] = [
  [0, 0], [0, 51.5], [-0.13, 51.5], [139.7, 35.7], [151.2, -33.9],
  [-122.4, 37.8], [2.35, 48.86], [-58.4, -34.6], [77.2, 28.6], [37.6, 55.75],
  [-99.13, 19.43], [116.4, 39.9], [18.42, -33.92], [-157.86, 21.3], [174.76, -36.85],
  [0, 89], [0, -89], [45, 45], [-135, -45], [179.9, 0], [-179.9, 0],
];

describe("the sphere mapping agrees with solarZenithDeg", () => {
  const dates = [
    new Date("2026-03-20T12:00:00Z"), // equinox
    new Date("2026-06-21T12:00:00Z"), // solstice
    new Date("2026-12-21T12:00:00Z"),
    new Date("2026-10-17T03:17:00Z"),
  ];

  test("dot(normal, sunDir) has the same sign as the zenith angle, everywhere", () => {
    for (const date of dates) {
      const sub = subsolarPoint(date);
      const sun = sunDirection(sub);
      for (const [lon, lat] of SAMPLE_POINTS) {
        const d = lonLatToVec3(lon, lat).dot(sun);
        const z = solarZenithDeg(lat, lon, sub);
        expect(Math.sign(d)).toBe(Math.sign(90 - z));
        // and the magnitude is cos(zenith), not merely sign-agreeing
        expect(Math.abs(d - Math.cos(z * (Math.PI / 180)))).toBeLessThan(1e-12);
      }
    }
  });

  test("the shader's day test is exactly isDaylight, including the polar edges", () => {
    for (const date of dates) {
      const sub = subsolarPoint(date);
      const sun = sunDirection(sub);
      for (const [lon, lat] of SAMPLE_POINTS) {
        const shaderSaysDay = lonLatToVec3(lon, lat).dot(sun) > 0;
        expect(shaderSaysDay).toBe(isDaylight(lat, lon, date));
      }
    }
  });

  test("lonLatToVec3 round-trips through vec3ToLonLat", () => {
    for (const [lon, lat] of SAMPLE_POINTS) {
      const back = vec3ToLonLat(lonLatToVec3(lon, lat));
      expect(Math.abs(back.lat - lat)).toBeLessThan(1e-9);
      // longitude is modulo 360, so compare on the circle
      expect(Math.abs(((back.lon - lon + 540) % 360) - 180)).toBeLessThan(1e-9);
    }
  });
});

describe("the sphere projects to the same pixels as d3's orthographic globe", () => {
  // If this holds, the R3F globe and the SVG globe are the same picture and a
  // camera move on one cannot show something the other would contradict.
  const CENTERS: [number, number][] = [
    [0, 0], [2.35, 48.86], [139.7, 35.7], [-122.4, 37.8], [0, 85], [0, -85],
  ];
  const K = 140;
  const T: [number, number] = [160, 160];

  for (const [cLon, cLat] of CENTERS) {
    test(`centre ${cLon},${cLat} agrees within a thousandth of a pixel`, () => {
      // d3 does NOT clip in the projection — `clipExtent` stays null and
      // far-side points still return coordinates; clipping happens inside
      // `geoPath`. Both shipped globes therefore do their own test with
      // `geoDistance(...) <= π/2`, which is exactly `dot(v, forward) >= 0`.
      // That app predicate is what this compares against.
      const proj = geoOrthographic().rotate([-cLon, -cLat]).scale(K).translate(T);
      for (const [lon, lat] of SAMPLE_POINTS) {
        const mine = projectOrthographic(lon, lat, cLon, cLat, K, T[0], T[1]);
        const appSaysVisible = geoDistance([lon, lat], [cLon, cLat]) <= Math.PI / 2;
        expect(mine !== null).toBe(appSaysVisible);
        if (mine && appSaysVisible) {
          const theirs = proj([lon, lat]) as [number, number];
          expect(Math.abs(mine[0] - theirs[0])).toBeLessThan(1e-3);
          expect(Math.abs(mine[1] - theirs[1])).toBeLessThan(1e-3);
        }
      }
    });
  }

  test("the view basis is orthonormal and right-handed at every centre", () => {
    for (const [cLon, cLat] of CENTERS) {
      const { forward, right, up } = viewBasis(cLon, cLat);
      for (const v of [forward, right, up]) expect(v.length()).toBeCloseTo(1, 12);
      expect(forward.dot(right)).toBeCloseTo(0, 12);
      expect(forward.dot(up)).toBeCloseTo(0, 12);
      expect(right.dot(up)).toBeCloseTo(0, 12);
      // three's camera convention: +Z points *out of* the screen, so forward is
      // −Z and right × up = −forward. Asserting +1 would be asserting a
      // left-handed screen basis, which mirrors east and west.
      expect(new Vector3().crossVectors(right, up).dot(forward)).toBeCloseTo(-1, 10);
    }
  });
});

describe("the ghost terminator's shader equivalent matches dawn-layers", () => {
  // dawn-layers gives the ghost as a geoCircle around the body's antipode. In
  // the shader the same line is "equidistant from bodySunDir", i.e. the set of
  // normals perpendicular to bodySunDir. These must select the same points.
  const sub = subsolarPoint(new Date("2026-10-17T03:17:00Z"));

  for (const owedMin of [30, 120, 480, -480]) {
    const requiredShiftMin = 480;
    const body = bodySubsolarPoint(sub, owedMin, requiredShiftMin);
    const bodySun = sunDirection(body);

    test(`owed ${owedMin}m — the ghost's great circle is where dot(n, bodySun) === 0`, () => {
      // dawn-layers' own gate: below it the ghost is deliberately not drawn.
      const drawn = Math.abs(owedMin) >= GHOST_VISIBLE_MIN;
      expect(drawn).toBe(true);

      // Walk the equator. The great circle crosses it twice — once at the body's
      // dawn meridian and once at its dusk — and dawn-layers names only the
      // dawn one (ghostDawnLon = bodyLon − 90). Both must be found, and the
      // dawn one must land where dawn-layers says it does.
      const gen = geoOrthographic().scale(1).translate([0, 0]);
      const layers = dawnLayers(gen as never, sub, owedMin, requiredShiftMin, {
        ghostPrecision: 0.5,
      });
      expect(layers.ghostPath).not.toBeNull();
      expect(layers.ghostDawnLon).not.toBeNull();

      // `prev` must start at the first sample, not at lon 0, or the sweep's
      // own discontinuity registers as a phantom crossing.
      let prev = lonLatToVec3(-180, 0).dot(bodySun);
      const found: number[] = [];
      for (let lon = -180; lon <= 180; lon += 0.25) {
        const cur = lonLatToVec3(lon, 0).dot(bodySun);
        if (Math.sign(cur) !== Math.sign(prev)) found.push(lon - 0.125);
        prev = cur;
      }
      expect(found.length).toBe(2);

      // One of the two is the dawn meridian dawn-layers publishes.
      const circDist = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
      const dawnDist = found.map((f) => circDist(f, layers.ghostDawnLon as number));
      expect(Math.min(...dawnDist)).toBeLessThan(0.13);
      // The other is its antipode-on-the-equator, i.e. body dusk.
      const duskDist = found.map((f) => circDist(f, layers.bodyLon + 90));
      expect(Math.min(...duskDist)).toBeLessThan(0.13);

      // And that crossing is the anti-solar meridian of the *body* sun.
      const at = lonLatToVec3(layers.bodyLon - 90, 0).dot(bodySun);
      expect(Math.abs(at)).toBeLessThan(1e-9);
    });
  }

  test("the ghost never draws past the trip's full shift", () => {
    // dawn-layers caps the drift at requiredShiftMin; the shader uniform must
    // respect the same cap or the two surfaces show different residuals.
    const overshoot = bodySubsolarPoint(sub, 99999, 480);
    const capped = bodySubsolarPoint(sub, 480, 480);
    expect(overshoot.lon).toBeCloseTo(capped.lon, 12);
    expect(overshoot.lat).toBeCloseTo(capped.lat, 12);
  });

  test("shiftMinToDeg is the quarter-degree the comment claims", () => {
    expect(shiftMinToDeg(60)).toBeCloseTo(15, 12);
  });
});