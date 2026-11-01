/* Pure momentum helpers — the maths behind the smear-blur trial. No DOM,
 * no time: given a velocity, what does the motion borrow before it settles?
 * Values stay cheap (px, degrees, scale) so the client can write them to
 * CSS custom properties without re-rendering. */

export interface Smear {
  /** Tail length in px — proportional to speed, clamped to 0–120. */
  length: number;
  /** Opacities of the three ghost copies trailing the disc. */
  ghostOpacity: [number, number, number];
  /** Stretch along the direction of travel (1 = none). */
  scaleAlong: number;
  /** Squash across the direction of travel (1 = none). */
  scaleAcross: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Below this the motion is imperceptible — return identity and stop drawing. */
const DEAD_V = 40;

export function smearFor(vPxPerSec: number): Smear {
  const v = Math.abs(vPxPerSec);
  if (v < DEAD_V) return { length: 0, ghostOpacity: [0, 0, 0], scaleAlong: 1, scaleAcross: 1 };
  const length = clamp(v * 0.12, 0, 120);
  const o = clamp(v / 800, 0, 1);
  const ghostOpacity: [number, number, number] = [0.25 * o, 0.15 * o, 0.08 * o];
  const scaleAlong = 1 + Math.min(v / 4000, 0.22);
  return { length, ghostOpacity, scaleAlong, scaleAcross: 1 / scaleAlong };
}

/** Snapping the release target: a window edge within magnetMin of the
 *  minute pulls harder than the 5-min grid; otherwise the grid wins. */
export function snapTarget(
  minute: number,
  edges: number[],
  gridMin = 5,
  magnetMin = 20,
): number {
  const m = clamp(Math.round(minute), 0, 1439);
  let bestEdge = Infinity;
  for (const e of edges) {
    const d = Math.abs(e - m);
    if (d < Math.abs(bestEdge - m)) bestEdge = e;
    if (d === Math.abs(bestEdge - m) && e < bestEdge) bestEdge = e;
  }
  if (edges.length && Math.abs(bestEdge - m) <= magnetMin) return bestEdge;
  const snapped = Math.round(m / gridMin) * gridMin;
  return clamp(snapped, 0, 1439);
}

/** The lean a moving block borrows — degrees, capped at ±8 so a fast drag
 *  reads as speed, not as a tip-over. */
export function leanFor(vPxPerSec: number): number {
  const v = clamp(-vPxPerSec / 120, -8, 8);
  return v === 0 ? 0 : v;
}
