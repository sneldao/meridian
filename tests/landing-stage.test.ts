import { describe, expect, test } from "bun:test";
import { demoJourney, sunSelfForBeat } from "@/domain/demo-beats";
import { landingFrame, LANDING_CROSS, LANDING_INSTANT } from "@/domain/landing-stage";

/* The landing stage's frame model (round 30): every figure the pinned stage
 * shows — owed, banked, dawn separation, sun position, the traveller's
 * face — is this function's output at a scroll progress. The locks below
 * hold the honesty law: the endpoints are exactly the beats' own reads, and
 * nothing in between is authored. */

describe("landingFrame — the stage's honest frame", () => {
  const j = demoJourney("miles");
  const required = Math.abs(j.trip.requiredShiftMin);

  test("the first frame is the stakes read, the last is the payoff", () => {
    const start = landingFrame(j, 0);
    expect(start.owedMin).toBe(required);
    expect(start.bankedMin).toBe(0);
    expect(start.ghostRatio).toBe(1);
    expect(start.face).toEqual(sunSelfForBeat(j, "stakes"));

    const end = landingFrame(j, 1);
    expect(end.bankedMin).toBe((j.read.projection?.deliveredHours ?? 0) * 60);
    expect(end.owedMin).toBe(required - end.bankedMin);
    expect(end.face).toEqual(sunSelfForBeat(j, "payoff"));
  });

  test("banked only ever grows — scroll can never invent a better plan", () => {
    let prev = -1;
    for (let p = 0; p <= 1.001; p += 0.05) {
      const f = landingFrame(j, p);
      expect(f.bankedMin).toBeGreaterThanOrEqual(prev);
      expect(f.bankedMin).toBeLessThanOrEqual(required);
      expect(f.owedMin).toBeCloseTo(required - f.bankedMin, 5);
      prev = f.bankedMin;
    }
  });

  test("the dawn separation is the owed ratio — the ghost never fully merges", () => {
    const g0 = landingFrame(j, 0).ghostRatio;
    const g1 = landingFrame(j, 1).ghostRatio;
    expect(g0).toBe(1);
    // Honest remainder: the plan banks 4.5h of 9.0h, so the dawns close to
    // half — not to a fake zero.
    expect(g1).toBeCloseTo(1 - (j.read.projection?.deliveredHours ?? 0) / (j.read.projection?.requiredHours ?? 1), 5);
    expect(g1).toBeGreaterThan(0);
  });

  test("the sun travels the stage and climbs as the plan banks", () => {
    const s0 = landingFrame(j, 0).sun;
    const sMid = landingFrame(j, (LANDING_CROSS.start + LANDING_CROSS.end) / 2).sun;
    const s1 = landingFrame(j, 1).sun;
    expect(s0.x).toBeCloseTo(0.08, 2);
    expect(s1.x).toBeCloseTo(0.92, 2);
    // A rising body sun means a lower y on the stage coordinate system.
    expect(s1.y).toBeLessThan(s0.y);
    expect(landingFrame(j, 0.5).bodyAltDeg).toBeGreaterThan(landingFrame(j, 0).bodyAltDeg);
    expect(sMid.x).toBeGreaterThan(s0.x);
    expect(sMid.x).toBeLessThan(s1.x);
  });

  test("rays lock as the plan executes — none at the stakes, all by the payoff", () => {
    expect(landingFrame(j, 0).face.raysLit).toBe(0);
    expect(landingFrame(j, 1).face.raysLit).toBe(j.plans.length);
  });

  test("the instant is the fictional meeting — fixed so every render agrees", () => {
    // 16:00 Tokyo on the arrival day, in UTC.
    expect(LANDING_INSTANT.toISOString()).toBe("2026-11-04T07:00:00.000Z");
  });
});

describe("landingFrame — the visitor's own route (round 30 phase 3)", () => {
  const j = demoJourney("miles");
  const visitorEast = {
    requiredMin: 300,
    signedShiftMin: -300,
    direction: "east" as const,
    destLat: 35.7,
    destLon: 139.7,
    bankedRatio: 0.6,
  };

  test("a resolved route replays the arc at their scale", () => {
    const f0 = landingFrame(j, 0, visitorEast);
    expect(f0.owedMin).toBe(300);
    expect(f0.bankedMin).toBe(0);
    expect(f0.ghostRatio).toBe(1);
    const f1 = landingFrame(j, 1, visitorEast);
    expect(f1.bankedMin).toBeCloseTo(180, 5);
    expect(f1.owedMin).toBeCloseTo(120, 5);
    // The ghost honestly never merges — it lands on their remainder.
    expect(f1.ghostRatio).toBeCloseTo(0.4, 5);
  });

  test("westbound flips the face's tilt — the direction is theirs, not the demo's", () => {
    const west = { ...visitorEast, direction: "west" as const, signedShiftMin: 300 };
    expect(landingFrame(j, 0, west).face.tiltDeg).toBe(-7);
    expect(landingFrame(j, 0, visitorEast).face.tiltDeg).toBe(7);
  });

  test("the dawn-drag is bounded by the plan's honest range", () => {
    // Below the floor → clamps to required - bankedCap (what the plan carries).
    expect(landingFrame(j, 0, null, 0).owedMin).toBe(270);
    // Above the debt → clamps to the full shift, never invents more owed.
    expect(landingFrame(j, 0, null, 9999).owedMin).toBe(540);
    // Inside the range → the explored value, banked consistent with it.
    const f = landingFrame(j, 0, null, 400);
    expect(f.owedMin).toBe(400);
    expect(f.bankedMin).toBe(140);
    // The drag's bounds scale with the visitor's route too.
    expect(landingFrame(j, 0, visitorEast, 0).owedMin).toBe(120);
  });
});
