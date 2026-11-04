import type { SunSelfRead } from "@/domain/sun-self";

/* Phase 2 — the glass instrument's parameter mapping. Pure: every input
 * is a field already on the domain read; nothing is re-derived, nothing
 * invented. debt rides `lid`, progress rides `glow`; raysLit is the
 * locked-day count and is never inferred from rayCount (which stays 12). */

export interface GlassParams {
  /** 0..1 residual debt — drives bloom haze and rim roughness. */
  debt: number;
  /** 0..1 delivered progress — drives core light. */
  progress: number;
  /** Halo/bloom radius factor (multiplies the base bloom). */
  bloom: number;
  /** Core luminous energy through the thick disc. */
  coreLight: number;
  /** Rim scatter — how smeared the etched rim reads. */
  roughness: number;
  /** Prismatic fringe width — wider when rested, near-zero when smoked. */
  dispersion: number;
  /** Rotation of the graticule in radians. */
  angleRad: number;
  /** Total ray/tick count (stays 12). */
  rayCount: number;
  /** Lit ticks — locked days; NEVER clamped to equal rayCount. */
  raysLit: number;
}

const num = (v: number, fallback = 0) => (Number.isFinite(v) ? v : fallback);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function glassParams(read: SunSelfRead): GlassParams {
  const debt = clamp01(num(read.lid));
  const progress = clamp01(num(read.glow));
  const rayCount = Math.min(12, Math.max(0, Math.round(num(read.rayCount, 12))));
  return {
    debt,
    progress,
    bloom: 0.08 + 0.16 * debt,
    coreLight: 0.18 + 0.62 * progress,
    roughness: 0.08 + 0.18 * debt,
    dispersion: 0.012 + 0.016 * (1 - debt),
    angleRad: (num(read.tiltDeg) * Math.PI) / 180,
    rayCount,
    raysLit: Math.min(rayCount, Math.max(0, Math.round(num(read.raysLit)))),
  };
}
