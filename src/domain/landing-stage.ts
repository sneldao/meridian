/* The landing stage's frame model (round 30).
 *
 *  The landing is one pinned stage scrubbed by scroll: the gap (two dawns
 *  held apart by the shift still owed) → the night before (the crew) → the
 *  crossing (the sun travels its modeled arc while the plan banks hours)
 *  → the first morning (the jagged takeover, honestly scored). Every number
 *  on the stage — the sky's warmth, the sun's altitude, the dawn-line
 *  separation, the traveller's face — is derived here from the demo journey
 *  at a single scroll progress, so the performance can only ever show what
 *  the model says. Nothing is tweened by hand: the face is *recomputed*
 *  through `sunSelfRead` at every frame, which is why its endpoints land
 *  exactly on the beats' own reads (stakes at the start, payoff at the end).
 *
 *  The instant is fixed at the fictional meeting — 16:00 Tokyo on the
 *  arrival day — so server, client and every scroll position agree on the
 *  same sun. */

import { bodySubsolarPoint, solarZenithDeg, subsolarPoint } from "./sun";
import { stageSunFor, type StageSunRead } from "./stage-sun";
import { sunSelfRead, type SunSelfRead } from "./sun-self";
import type { DemoJourney } from "./demo-beats";

/** 16:00 in Tokyo on D+1 — the demo journey's fictional moment as a real
 *  instant (the journey carries it as minutes-of-day, 960). */
export const LANDING_INSTANT = new Date("2026-11-04T07:00:00Z");

/** Scroll window of the crossing beat — banked hours ease across it while
 *  the sun's stage position scrubs linearly (scroll IS the scrubber). */
export const LANDING_CROSS = { start: 0.42, end: 0.8 } as const;

/** The visitor's own route, resolved at the entry form (round 30 phase 3).
 *  When present the stage plays the same honest arc at *their* scale: the
 *  gap is theirs, the banked cap is what the solver preview actually
 *  carried for that route, and the sun rises over their destination. */
export interface LandingVisitor {
  /** The shift their route owes, minutes (≥ 0). */
  requiredMin: number;
  /** Signed shift — east negative — for the body's sub-solar point. */
  signedShiftMin: number;
  direction: "east" | "west";
  /** Destination coordinates for the body sun's altitude. */
  destLat: number;
  destLon: number;
  /** 0..1 — what the solver preview banked for their route (covPct).
   *  Falls back to the demo's own ratio when the preview can't place. */
  bankedRatio: number;
}

export interface LandingFrame {
  /** Shift still owed at this scroll point — 540 → the projection's carry. */
  owedMin: number;
  /** Shift banked so far — 0 → deliveredHours. */
  bankedMin: number;
  /** 0..1 linear position through the crossing beat (drives the sun's x). */
  crossingT: number;
  /** owed/required — the separation of the two dawn lines, 1 → the honest remainder. */
  ghostRatio: number;
  /** The body clock's solar altitude at the meeting instant, owed-applied. */
  bodyAltDeg: number;
  /** The traveller's face — recomputed, never interpolated. */
  face: SunSelfRead;
  /** The disc's stage position for this frame. */
  sun: StageSunRead;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

export function landingFrame(
  journey: DemoJourney,
  p: number,
  visitor?: LandingVisitor | null,
  owedOverride?: number | null,
): LandingFrame {
  const required = visitor ? Math.max(0, visitor.requiredMin) : Math.abs(journey.trip.requiredShiftMin);
  const bankedCap = visitor
    ? required * clamp01(visitor.bankedRatio)
    : (journey.read.projection?.deliveredHours ?? 0) * 60;
  const direction = visitor?.direction ?? journey.trip.direction;
  const signedShift = visitor?.signedShiftMin ?? journey.trip.requiredShiftMin;
  const destLat = visitor?.destLat ?? journey.trip.destination.lat;
  const destLon = visitor?.destLon ?? journey.trip.destination.lon;

  const e = smooth(clamp01((p - LANDING_CROSS.start) / (LANDING_CROSS.end - LANDING_CROSS.start)));
  let banked = bankedCap * e;
  let owed = required - banked;
  // The dawn-drag explores only the plan's honest range: from the full
  // debt down to what the plan carries — never past it. A visitor who
  // could merge the dawns entirely would be sold a plan that doesn't exist.
  if (owedOverride != null) {
    owed = Math.max(required - bankedCap, Math.min(required, owedOverride));
    banked = required - owed;
  }

  const sub = bodySubsolarPoint(subsolarPoint(LANDING_INSTANT), owed, signedShift);
  const bodyAltDeg = 90 - solarZenithDeg(destLat, destLon, sub);
  const crossingT = clamp01((p - LANDING_CROSS.start) / (LANDING_CROSS.end - LANDING_CROSS.start));

  return {
    owedMin: owed,
    bankedMin: banked,
    crossingT,
    ghostRatio: required === 0 ? 0 : clamp01(owed / required),
    bodyAltDeg,
    face: sunSelfRead({
      owedMin: owed,
      deliveredMin: banked,
      requiredMin: required,
      direction,
      // Days lock as the plan executes — 0 at the stakes end, the journey's
      // own plan count by the payoff, so the face's rays trace the work.
      daysLocked: Math.round(e * journey.plans.length),
    }),
    sun: stageSunFor(bodyAltDeg, crossingT, null),
  };
}
