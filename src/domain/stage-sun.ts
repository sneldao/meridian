// Where a stage draws its sun. The position is the same solar model the
// scrubber inspects (sceneSolar); this module turns it into stage
// coordinates, plus the one display rule that keeps a sun on screen: below
// the horizon the disc rides the band instead of sinking off-stage — a stage
// without a sun is not a stage. The read is words first: the caption names
// the altitude, so the position is the enhancement, never the only route to
// the fact (Rule 2 stands).

/** Altitude in degrees, clamped for the stage floor. */
export interface StageSunRead {
  /** 0..1 horizontal position across the stage. */
  x: number;
  /** 0..1 vertical position, 1 = the horizon line. */
  y: number;
  /** True when the sun is below the horizon and rides the band instead. */
  belowHorizon: boolean;
  /** The model's answer in words, for the caption. */
  bandLabel: string | null;
}

/** Horizon sits three-quarters down the stage. */
const HORIZON_Y = 0.75;
/** Below this altitude the disc is held on the band. */
const FLOOR_ALT_DEG = -8;
/** Sun's half-diameter as a fraction of the stage, so sizes track the stage. */
const SUN_D = 0.16;

/**
 * Stage coordinates for a solar altitude and a time-of-day fraction.
 *
 * `x` sweeps a gentle arc with the day fraction (a sun travels, it does not
 * teleport). `y` maps altitude linearly between the floor clamp and zenith;
 * the mapping is deliberately simple — the *physics* lives in the altitude
 * the caller computed, this is only where the disc stands for it.
 */
export function stageSunFor(altitudeDeg: number | null, dayFraction: number, bandLabel: string | null): StageSunRead {
  const belowHorizon = altitudeDeg === null || altitudeDeg < 0;
  const held = altitudeDeg === null ? FLOOR_ALT_DEG : Math.max(altitudeDeg, FLOOR_ALT_DEG);
  // altitude −8 → 1 (horizon), altitude 60+ → the top of the stage
  const y = HORIZON_Y - (Math.min(60, held + 8) / 68) * (HORIZON_Y - SUN_D);
  const x = 0.08 + 0.84 * Math.max(0, Math.min(1, dayFraction));
  return { x, y, belowHorizon, bandLabel };
}

/** CSS custom properties the stage writes imperatively (zero inline styles). */
export const STAGE_SUN_VARS = ["--stage-sun-x", "--stage-sun-y", "--stage-sun-d"] as const;

export function stageSunVars(read: StageSunRead): Record<string, string> {
  return {
    "--stage-sun-x": `${(read.x * 100).toFixed(2)}%`,
    "--stage-sun-y": `${(read.y * 100).toFixed(2)}%`,
    "--stage-sun-d": `${(SUN_D * 100).toFixed(1)}%`,
  };
}
