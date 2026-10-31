/**
 * The stage sky — the same solar model the Window Seat flies, projected onto
 * the ink stages (`.hero`, `.clock-stage`, `.arr`) as CSS custom properties.
 *
 * The stage is not a window. A window shows the scattered sky; the stage is
 * the light the body is about to receive. So the horizon band takes the
 * *transmitted beam* — `sunBeamColor` in @/domain/sky, the direct solar light
 * reddened by the same Rayleigh extinction the sky uses — which is ember below
 * the horizon and near-white gold above it. The zenith stop takes the
 * scattered sky — `skyStops().zenith` — tinted into the stage's ink so the
 * model moves the surface without breaking the palette.
 *
 * Three variables come out:
 *
 *   · `--stage-horizon` — the beam colour at the body sun's altitude, encoded
 *     and capped so paper text survives on the band. Height and alpha both
 *     ride `t = clamp01((alt + 18) / 24)`, so night is a faint ember glow low
 *     on the stage and a sun-up body gets a tall warm horizon.
 *   · `--stage-ink-2` — the gradient's lower stop, ink pulled a little toward
 *     the real sky's zenith as the body sun climbs.
 *   · `--stage-origin` — a residue of origin blue fading as the plan banks
 *     its shift, the ghost rule rendered as a wash on the stage floor.
 *
 * `stageSkyFor` returns {} for a null date so the server render and the first
 * client render agree on the :root defaults — no hydration mismatch.
 */

import type { CSSProperties } from "react";
import { encodeSRGB, skyStops, sunBeamColor } from "@/domain/sky";
import { bodySubsolarPoint, solarZenithDeg, subsolarPoint } from "@/domain/sun";
import type { Trip } from "@/domain/types";

export interface StageSky {
  /** CSS colour for the horizon band (rgba): the transmitted beam, capped for text contrast. */
  horizon: string;
  /** Band height as a CSS percentage string, e.g. "26%". */
  horizonHeight: string;
  /** rgba ground haze below the line — the band's rgb at a floor alpha. */
  horizonFloor: string;
  /** rgb() for the gradient's lower stop: ink-2 tinted toward the sky's zenith. */
  zenith: string;
  /** rgba of origin blue #9db8ff; alpha ∝ shift still owed. */
  origin: string;
  bodyAltDeg: number;
}

/** The custom properties a stage writes, in emission order — shared by
 *  `stageSkyVars` and the imperative writer in HeroDawnPanel. */
export const STAGE_SKY_VARS = [
  "--stage-horizon",
  "--stage-horizon-h",
  "--stage-horizon-floor",
  "--stage-ink-2",
  "--stage-origin",
] as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Encoded-channel cap so paper text (#e8eaf2) stays legible on the band. */
const MAX_CHANNEL = 199;

/** The stage's lower ink stop, `--stage-ink-2` / #0c1220. */
const INK_2: [number, number, number] = [12, 18, 32];

export function stageSky(bodyAltDeg: number, owedMin: number, requiredShiftMin: number): StageSky {
  const t = clamp01((bodyAltDeg + 18) / 24);

  // The band is the transmitted beam, not the scattered sky. Encode first,
  // then cap the strongest channel — the ratio (hue) survives, the level
  // (luminance) is what text contrast constrains.
  const beam = sunBeamColor(bodyAltDeg);
  const enc = beam.map(encodeSRGB);
  const peak = Math.max(...enc);
  const k = peak > MAX_CHANNEL ? MAX_CHANNEL / peak : 1;
  const alpha = clamp01(0.24 + 0.16 * t);
  const floorAlpha = 0.05 + 0.08 * t;

  const heightPct = Math.round((10 + 26 * t) * 10) / 10;

  // The zenith stop: the real sky's zenith, mixed into ink-2 by t — night
  // keeps the stage's ink, a risen sun lets a little of the sky through.
  const w = 0.22 * t;
  const skyZenith = skyStops(bodyAltDeg).zenith.map(encodeSRGB);
  const zenithCh = INK_2.map((ink, c) => Math.round(ink * (1 - w) + skyZenith[c] * w));

  const owedRatio =
    requiredShiftMin === 0 ? 0 : clamp01(Math.abs(owedMin) / Math.abs(requiredShiftMin));

  const rgb = `${Math.round(enc[0] * k)}, ${Math.round(enc[1] * k)}, ${Math.round(enc[2] * k)}`;
  return {
    horizon: `rgba(${rgb}, ${alpha.toFixed(3)})`,
    horizonHeight: `${heightPct}%`,
    horizonFloor: `rgba(${rgb}, ${floorAlpha.toFixed(3)})`,
    zenith: `rgb(${zenithCh[0]}, ${zenithCh[1]}, ${zenithCh[2]})`,
    origin: `rgba(157, 184, 255, ${(0.22 * owedRatio).toFixed(3)})`,
    bodyAltDeg,
  };
}

export function stageSkyVars(sky: StageSky): CSSProperties {
  return {
    [STAGE_SKY_VARS[0]]: sky.horizon,
    [STAGE_SKY_VARS[1]]: sky.horizonHeight,
    [STAGE_SKY_VARS[2]]: sky.horizonFloor,
    [STAGE_SKY_VARS[3]]: sky.zenith,
    [STAGE_SKY_VARS[4]]: sky.origin,
  } as Record<string, string> as CSSProperties;
}

/**
 * Convenience: the body clock's sky for a trip at a moment.
 * Null date → {} (server + first client render; CSS defaults apply).
 */
export function stageSkyFor(trip: Trip | null, owedMin: number, date: Date | null): CSSProperties {
  if (!trip || !date) return {};
  const sub = bodySubsolarPoint(subsolarPoint(date), owedMin, trip.requiredShiftMin);
  const bodyAltDeg = 90 - solarZenithDeg(trip.destination.lat, trip.destination.lon, sub);
  return stageSkyVars(stageSky(bodyAltDeg, owedMin, trip.requiredShiftMin));
}
