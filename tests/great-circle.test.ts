import { describe, expect, test } from "bun:test";
import { geoDistance, geoInterpolate } from "d3-geo";
import { DEMO_TRIP, buildTrip } from "@/domain/fixtures";
import { alongArc, chasePosition, easeInOut, greatCircle } from "@/lib/globe/great-circle";
import { lonLatToVec3, vec3ToLonLat } from "@/lib/globe/spherical";

// The camera fly is the 85-second payoff, so it has to fly the route the rest
// of the app already draws. These keep it honest.

describe("greatCircle", () => {
  test("starts at the origin and ends at the destination", () => {
    const gc = greatCircle(DEMO_TRIP);
    const start = vec3ToLonLat(gc.points[0]);
    const end = vec3ToLonLat(gc.points[gc.points.length - 1]);
    expect(start.lon).toBeCloseTo(DEMO_TRIP.origin.lon, 6);
    expect(start.lat).toBeCloseTo(DEMO_TRIP.origin.lat, 6);
    expect(end.lon).toBeCloseTo(DEMO_TRIP.destination.lon, 6);
    expect(end.lat).toBeCloseTo(DEMO_TRIP.destination.lat, 6);
  });

  test("every sample lies on the unit sphere", () => {
    const gc = greatCircle(DEMO_TRIP);
    for (const p of gc.points) expect(p.length()).toBeCloseTo(1, 9);
  });

  test("matches d3's geoInterpolate, the function WorldLens draws the arc with", () => {
    // The whole point: one route, not two that differ by a few degrees.
    const gc = greatCircle(DEMO_TRIP);
    const interp = geoInterpolate(
      [DEMO_TRIP.origin.lon, DEMO_TRIP.origin.lat],
      [DEMO_TRIP.destination.lon, DEMO_TRIP.destination.lat],
    );
    for (const t of [0, 0.13, 0.37, 0.5, 0.71, 0.94, 1]) {
      const [lon, lat] = interp(t);
      const mine = vec3ToLonLat(alongArc(gc, t).point);
      const circ = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
      expect(circ(mine.lon, lon)).toBeLessThan(0.9);
      expect(Math.abs(mine.lat - lat)).toBeLessThan(0.9);
    }
  });

  test("spanDeg agrees with d3's own great-circle distance", () => {
    const gc = greatCircle(DEMO_TRIP);
    const d = geoDistance(
      [DEMO_TRIP.origin.lon, DEMO_TRIP.origin.lat],
      [DEMO_TRIP.destination.lon, DEMO_TRIP.destination.lat],
    );
    expect(gc.spanDeg).toBeCloseTo((d * 180) / Math.PI, 9);
    // LHR to Tokyo is roughly 9,500km — a sanity bound, not an exact figure.
    expect(gc.spanDeg).toBeGreaterThan(70);
    expect(gc.spanDeg).toBeLessThan(110);
  });

  test("crosses the antimeridian the short way, without wrapping off the sphere", () => {
    // A westbound Pacific route is the case that breaks naive longitude maths.
    const trip = buildTrip("LAX", "NRT", "2026-10-18");
    const gc = greatCircle(trip);
    for (const p of gc.points) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      expect(p.length()).toBeCloseTo(1, 9);
    }
    // `circ` is already the shortest distance around the circle, so a healthy
    // step is small. A wrap bug shows up as a step near 180°.
    let prev = vec3ToLonLat(gc.points[0]).lon;
    for (const p of gc.points.slice(1)) {
      const lon = vec3ToLonLat(p).lon;
      const jump = Math.abs(((lon - prev + 540) % 360) - 180);
      expect(jump).toBeLessThan(1.0);
      prev = lon;
    }
  });
});

describe("alongArc", () => {
  const gc = greatCircle(DEMO_TRIP);

  test("clamps outside 0..1 rather than extrapolating into space", () => {
    const a = alongArc(gc, -5);
    const z = alongArc(gc, 0);
    expect(a.point.distanceTo(z.point)).toBeCloseTo(0, 9);
    const b = alongArc(gc, 99);
    const one = alongArc(gc, 1);
    expect(b.point.distanceTo(one.point)).toBeCloseTo(0, 9);
  });

  test("is monotonic in distance from the origin", () => {
    const origin = lonLatToVec3(DEMO_TRIP.origin.lon, DEMO_TRIP.origin.lat);
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const d = alongArc(gc, t).point.distanceTo(origin);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  test("the tangent is a unit vector pointing along the direction of travel", () => {
    const { point, tangent } = alongArc(gc, 0.5);
    expect(tangent.length()).toBeCloseTo(1, 9);
    // Moving a little further along the arc should reduce the angle to the
    // tangent, i.e. the tangent really points forwards.
    const ahead = alongArc(gc, 0.55).point;
    const toAhead = ahead.sub(point).normalize();
    expect(tangent.dot(toAhead)).toBeGreaterThan(0.5);
  });
});

describe("easeInOut", () => {
  test("pins both ends and stays inside the unit interval", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    for (let t = -1; t <= 2; t += 0.05) {
      const e = easeInOut(t);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
    }
  });

  test("is symmetric about the midpoint", () => {
    for (const t of [0.1, 0.25, 0.4]) {
      expect(easeInOut(t) + easeInOut(1 - t)).toBeCloseTo(1, 9);
    }
  });

  test("eases out of rest — no lurch on the first frame", () => {
    // The derivative at 0 is 0, so the first frame of the move barely moves.
    expect(easeInOut(0.001) - easeInOut(0)).toBeLessThan(1e-5);
  });
});

describe("chasePosition", () => {
  test("sits behind the target along the tangent and outside the globe", () => {
    const gc = greatCircle(DEMO_TRIP);
    const { point, tangent } = alongArc(gc, 0.4);
    const cam = chasePosition(point, tangent, 0.85, 0.3);
    // Behind: the target is ahead of the camera along the tangent.
    expect(cam.clone().sub(point).dot(tangent)).toBeLessThan(0);
    // Outside the surface, or the camera is inside the earth.
    expect(cam.length()).toBeGreaterThan(1.02);
  });

  test("stays finite when the arc runs over a pole", () => {
    // LHR→HND's great circle passes close to the pole, where a naive
    // tangent × worldUp cross product collapses to zero.
    const gc = greatCircle(DEMO_TRIP);
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const { point, tangent } = alongArc(gc, t);
      const cam = chasePosition(point, tangent, 0.85, 0.3);
      expect(Number.isFinite(cam.x) && Number.isFinite(cam.y) && Number.isFinite(cam.z)).toBe(true);
      expect(cam.length()).toBeGreaterThan(1.02);
    }
  });

  test("never dips below the horizon plane by more than the lift allows", () => {
    const gc = greatCircle(DEMO_TRIP);
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const { point, tangent } = alongArc(gc, t);
      const cam = chasePosition(point, tangent, 0.85, 0.3);
      expect(cam.y).toBeGreaterThan(-0.001);
    }
  });
});