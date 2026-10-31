/**
 * The stage sky — the same solar model the Window Seat flies, projected onto
 * the ink stages (`.hero`, `.clock-stage`, `.arr`) as CSS custom properties.
 *
 * The model behind it is `skyStops` in @/domain/sky: one scattering function
 * of the body clock's sun altitude at the destination. The stage cannot take
 * the model's colours raw — paper text sits on the band, so its luminance is
 * clamped — but the hue and the ordering are the physics, not a palette.
 *
 * Three variables come out:
 *
 *   · `--stage-horizon` — the horizon band's colour. The ember line rises and
 *     saturates as the body sun climbs: height and alpha both ride
 *     `t = clamp01((alt + 18) / 24)`, so night is a faint low band and a
 *     sun-up body gets a tall warm horizon.
 *   · `--stage-origin` — a residue of origin blue fading as the plan banks
 *     its shift, the ghost rule rendered as a wash on the stage floor.
 *
 * `stageSkyFor` returns {} for a null date so the server render and the first
 * client render agree on the :root defaults — no hydration mismatch.
 */

import type { CSSProperties } from "react";
import { skyStops } from "@/domain/sky";
import { bodySubsolarPoint, solarZenithDeg, subsolarPoint } from "@/domain/sun";
import type { Trip } from "@/domain/types";

export interface StageSky {
  /** CSS colour for the horizon band (rgba), hue from the sky model, luminance clamped for text contrast. */
  horizon: string;
  /** Band height as a CSS percentage string, e.g. "26%". */
  horizonHeight: string;
  /** rgba of origin blue #9db8ff; alpha ∝ shift still owed. */
  origin: string;
  bodyAltDeg: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Luminance cap so paper text (#e8eaf2) stays legible on the band. */
const MAX_CHANNEL = 0.78;

export function stageSky(bodyAltDeg: number, owedMin: number, requiredShiftMin: number): StageSky {
  const { horizon } = skyStops(bodyAltDeg);

  // Clamp the display colour: if the strongest channel exceeds the cap, scale
  // all three down by the same factor — hue survives, brightness does not.
  const peak = Math.max(horizon[0], horizon[1], horizon[2]);
  const k = peak > MAX_CHANNEL ? MAX_CHANNEL / peak : 1;
  const t = clamp01((bodyAltDeg + 18) / 24);
  const alpha = clamp01(0.28 + 0.55 * t);

  const chan = (c: number) => Math.round(c * k * 255);
  const heightPct = Math.round((10 + 34 * t) * 10) / 10;

  const owedRatio =
    requiredShiftMin === 0 ? 0 : clamp01(Math.abs(owedMin) / Math.abs(requiredShiftMin));

  return {
    horizon: `rgba(${chan(horizon[0])}, ${chan(horizon[1])}, ${chan(horizon[2])}, ${alpha.toFixed(3)})`,
    horizonHeight: `${heightPct}%`,
    origin: `rgba(157, 184, 255, ${(0.22 * owedRatio).toFixed(3)})`,
    bodyAltDeg,
  };
}

export function stageSkyVars(sky: StageSky): CSSProperties {
  return {
    "--stage-horizon": sky.horizon,
    "--stage-horizon-h": sky.horizonHeight,
    "--stage-origin": sky.origin,
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
