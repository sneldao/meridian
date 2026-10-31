/**
 * Sky colour from the sun's altitude — the model behind the Window Seat.
 *
 * The ending shows two skies: the one your body thinks it is under, and the one
 * at the destination. They converge as the plan banks its shift, and that
 * convergence is the whole product thesis rendered as light.
 *
 * The colours are computed rather than chosen, because a hand-picked sunset
 * palette cannot be trusted to converge: "your sky" and "the real sky" have to
 * be the *same function* of two solar altitudes, or the moment they meet is a
 * cross-fade between two arbitrary gradients rather than a real arrival.
 *
 * ## What this is
 *
 * A single-scattering Rayleigh approximation, closed form, no integral:
 *
 *   · Kasten-Young relative air mass from the sun's altitude;
 *   · Rayleigh optical depth proportional to λ⁻⁴ at three wavelengths;
 *   · the direct solar beam attenuated by that same optical depth over the
 *     solar path — the term that reddens a low sun;
 *   · one scattering event, so the radiance is β·(1 − e^−τ)·T;
 *   · plus an explicit horizon-glow term in the colour of the *transmitted
 *     beam*, because single scattering provably cannot produce an orange
 *     horizon on its own (see `horizonGlow`).
 *
 * ## What this is not
 *
 * Not radiative transfer. No ozone Chappuis band, no aerosol turbidity, no
 * proper multiple scattering, no terrain, no clouds, and the grey extinction
 * constant is a fudge standing in for aerosol and ozone together. It gets the
 * direction and the ordering of real sky colour right, it is continuous
 * everywhere including across the horizon, and that is what a 2D window needs.
 * It is not a claim about the actual sky over Tokyo, and the surface says so.
 */

/** Representative wavelengths for R, G, B in nanometres. */
const LAMBDA_R = 680;
const LAMBDA_G = 550;
const LAMBDA_B = 440;

/** Rayleigh scattering ∝ λ⁻⁴, normalised so blue is 1. */
const BETA: RGB = [
  Math.pow(LAMBDA_B, 4) / Math.pow(LAMBDA_R, 4),
  Math.pow(LAMBDA_B, 4) / Math.pow(LAMBDA_G, 4),
  1,
];

/** Rayleigh optical depth at zenith for blue, a standard sea-level figure. */
const TAU_BLUE_ZENITH = 0.1;

/** Grey extinction standing in for aerosol plus ozone. Not a real coefficient
 *  — it is the one number tuned to keep the low sun from going magenta. */
const TAU_GREY = 0.06;

/** Relative air mass beyond which the solar path is treated as fully
 *  extinguished. Kasten-Young diverges as the sun approaches the horizon, and
 *  so does the real sun's beam; clamping is honest where integrating is not. */
export const MAX_AIR_MASS = 40;

/** A colour, as three linear channels. */
export type RGB = [number, number, number];

export type SkyBand = "day" | "golden" | "blue-hour" | "civil" | "nautical" | "night";

/**
 * The twilight bands, at their conventional solar altitudes in degrees.
 *
 * `night` starts at −18°, where astronomical twilight ends and the sky is
 * properly dark. The textbook "astronomical twilight" band below it is not a
 * separate entry because it is unreachable as a *label*: a site's solar
 * altitude only falls as low as `latitude − 90`, so Tokyo never sees below
 * about −54° and nowhere reaches −90°. Listing it would be a band the surface
 * could never print.
 */
const BANDS: ReadonlyArray<{ above: number; band: SkyBand }> = [
  { above: 6, band: "day" },
  { above: -0.833, band: "golden" },
  { above: -6, band: "blue-hour" },
  { above: -12, band: "civil" },
  { above: -18, band: "nautical" },
  { above: -Infinity, band: "night" },
];

export function skyBand(sunAltDeg: number): SkyBand {
  for (const b of BANDS) if (sunAltDeg > b.above) return b.band;
  return "night";
}

/** Human words for the bands, shared so the Window Seat and the globe's hover
 *  read-out say the same thing in the same words. `band` is the model's answer;
 *  this is how the model says it. */
export const SKY_BAND_LABEL: Record<SkyBand, string> = {
  day: "full daylight",
  golden: "golden hour",
  "blue-hour": "blue hour",
  civil: "civil twilight",
  nautical: "nautical twilight",
  night: "night",
};

/**
 * Kasten-Young relative air mass for a solar altitude in degrees.
 *
 * Returns `MAX_AIR_MASS` at or below the horizon: there is no direct beam to
 * speak of, and the caller handles twilight separately.
 */
export function airMass(sunAltDeg: number): number {
  if (sunAltDeg <= 0) return MAX_AIR_MASS;
  const h = sunAltDeg;
  const m = 1 / (Math.sin(h * (Math.PI / 180)) + 0.50572 * Math.pow(h + 6.07995, -1.6364));
  return Math.min(MAX_AIR_MASS, Math.max(1, m));
}

/**
 * Effective air mass for the *chromaticity*.
 *
 * Below the horizon the light reaching the observer was scattered higher up,
 * through less air — which is exactly why twilight goes blue as it deepens
 * instead of staying the sunset's colour. Without this the air mass is clamped
 * at MAX_AIR_MASS for every sub-horizon altitude, so all of civil →
 * astronomical → night renders at one frozen colour differing only in
 * brightness. Documented approximation: the lit layer's height is a decay
 * constant, not something derived.
 */
function chromaAirMass(sunAltDeg: number): number {
  if (sunAltDeg >= 0) return airMass(sunAltDeg);
  return 1 + (MAX_AIR_MASS - 1) * Math.exp(-(-sunAltDeg) / 4.5);
}

/**
 * Brightness below the horizon, reaching zero at −18°.
 *
 * This has to fall *faster* than the relaxed air mass makes the scatter rise.
 * Letting the air mass relax is what turns twilight blue, but it also makes the
 * computed scatter brighter — and with a lazy decay curve the sky measurably
 * brightened as the sun set, the same class of bug as peak-normalising the
 * luminance. Hence the steep exponential times a linear cutoff, so night is
 * genuinely dark rather than very slightly less bright than dusk.
 */
function twilightFloor(sunAltDeg: number): number {
  if (sunAltDeg >= 0) return 1;
  const depth = -sunAltDeg;
  if (depth >= 18) return 0;
  return Math.exp(-depth / 1.6) * (1 - depth / 18);
}

/** Radiance for an altitude, split into what scatters and what survives. */
function radianceAt(sunAltDeg: number): { scatter: RGB; beam: RGB } {
  // The relaxed mass governs the scattered light below the horizon, both for
  // its hue (twilight is lit from higher up, through less air, hence blue) and
  // for how much of the beam survives. Using the true full-length solar path
  // here instead re-reddened every twilight band back to sunset orange, which
  // is how the first version of this lost the blue hour entirely. Brightness
  // is then carried by `twilightFloor`, which is explicit about being a chosen
  // curve rather than pretending to be emergent.
  const m = chromaAirMass(sunAltDeg);
  const scatter: RGB = [0, 0, 0];
  const beam: RGB = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const beta = BETA[c];
    const tau = TAU_BLUE_ZENITH * beta * m;
    const transmit = Math.exp(-(TAU_BLUE_ZENITH * beta + TAU_GREY) * m);
    // single scattering: the scattered fraction of the beam…
    scatter[c] = beta * (1 - Math.exp(-tau)) * transmit;
    // …and the beam itself over a full horizon's air mass, which is the one
    // place the true long path is the right answer.
    beam[c] = Math.exp(-(TAU_BLUE_ZENITH * beta + TAU_GREY) * MAX_AIR_MASS);
  }
  return { scatter, beam };
}

/** Rec.709 luminance weights. */
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Brightness with the sun overhead, so `luminance` reads 0..1. */
const ZENITH_LUMINANCE = lum(radianceAt(90).scatter) || 1;

/**
 * How much horizon glow to add.
 *
 * The single-scattering integral peaks in the **green** at low sun, not the
 * orange a real horizon shows. That is a known result, not a bug in the
 * arithmetic: the orange horizon is light that has been scattered more than
 * once. Rather than hand-pick a sunset hex and lie about where it came from,
 * the glow is added in the colour of the **directly transmitted solar beam**,
 * which this model does compute correctly and which is strongly red at a
 * horizon's 38 air masses. The warmth is therefore still derived from real
 * solar physics; the approximation is that it is added as a term rather than
 * integrated. Faded out by ±7° so it never touches the day sky.
 */
function horizonGlow(sunAltDeg: number): number {
  // Tight on purpose. Widening it to ±7° left the whole blue-hour band warm,
  // which defeats the point of having a blue hour.
  return Math.max(0, 1 - Math.abs(sunAltDeg + 0.5) / 3);
}

export interface Sky {
  /** Linear RGB, 0..1, before display gamma. Normalised so the strongest
   *  channel is 1 — the *ratio* between channels is the physics, the absolute
   *  level is a display decision. Use `luminance` for brightness. */
  rgb: RGB;
  /** 0..1 brightness: 1 with the sun overhead, falling to 0 through the bands.
   *  Absolute radiance against the zenith, NOT the peak-normalised channels.
   *  An earlier version divided by the peak here too, which made this a
   *  saturation measure — and made the sky *brighten* as the sun set, because
   *  red takes over as the strongest channel. */
  luminance: number;
  /** Which band the sun is in. Named, because "blue hour" is the product's
   *  word and the surface should be able to say it. */
  band: SkyBand;
}

/** Radiance for one solar altitude, in three channels. */
export function skyRadiance(sunAltDeg: number): Sky {
  const { scatter, beam } = radianceAt(sunAltDeg);
  const beamPeak = Math.max(beam[0], beam[1], beam[2], 1e-9);
  const level = lum(scatter);
  const glow = horizonGlow(sunAltDeg);

  const mixed: RGB = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    mixed[c] = scatter[c] + (beam[c] / beamPeak) * glow * level * 0.85;
  }

  const peak = Math.max(mixed[0], mixed[1], mixed[2], 1e-9);
  const rgb: RGB = [mixed[0] / peak, mixed[1] / peak, mixed[2] / peak];

  return {
    rgb,
    luminance: Math.min(1, (level / ZENITH_LUMINANCE) * twilightFloor(sunAltDeg)),
    band: skyBand(sunAltDeg),
  };
}

/** Linear → sRGB 0..255 for one channel (the same curve cssRGB uses). */
export function encodeSRGB(channel: number): number {
  const c = Math.max(0, Math.min(1, channel));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

export function cssRGB(rgb: RGB): string {
  return `rgb(${encodeSRGB(rgb[0])}, ${encodeSRGB(rgb[1])}, ${encodeSRGB(rgb[2])})`;
}

/**
 * Display-space gradient stops for a window.
 *
 * Two corrections happen here, and both are display decisions rather than
 * physics — which is why they live at the edge of the file and not inside
 * `skyRadiance`.
 *
 * **Brightness.** `rgb` is normalised so the strongest channel is 1, which
 * discards how much light there actually is. Rendering that directly made full
 * daylight and civil twilight come out the same saturated blue, which is
 * exactly the comparison the Window Seat exists to make. So the stops carry
 * `luminance`, with a floor so night is dark rather than pure black.
 *
 * **Saturation.** A bright sky is *paler* than a dim one, because multiple
 * scattering washes colour out — which this model does not simulate. Without
 * it a noon sky renders as aggressively saturated blue, which reads as a colour
 * swatch rather than air. So brightness also washes the channels toward white.
 */
export function skyStops(sunAltDeg: number): { horizon: RGB; zenith: RGB } {
  const { rgb, luminance } = skyRadiance(sunAltDeg);

  // Perceptual-ish: a gamma below 1 lifts the dim end so twilight still shows
  // its colour instead of crushing to black.
  const level = 0.05 + 0.95 * Math.pow(luminance, 0.55);
  const wash = Math.min(0.72, Math.pow(luminance, 1.4) * 0.72);

  const display = (c: number, scale: number): number => {
    const washed = c + (1 - c) * wash;
    return Math.min(1, washed * level * scale);
  };

  return {
    horizon: [display(rgb[0], 1), display(rgb[1], 1), display(rgb[2], 1)],
    // Less air overhead, so the zenith is darker and a shade cooler.
    zenith: [display(rgb[0], 0.62), display(rgb[1], 0.68), display(rgb[2], 0.88)],
  };
}

/**
 * Colour of the directly transmitted solar beam at an altitude — the light the
 * sun itself delivers, as opposed to the scattered sky. Reddened by the same
 * Rayleigh + grey extinction over the same air mass the sky uses; below the
 * horizon the path is the full horizon air mass, so the beam is ember and
 * stays ember. Normalised so the strongest channel is 1 (ratio is the physics,
 * level is a display decision). The stage backdrop uses this: the stage is not
 * a window, it is the light the body is about to receive.
 */
export function sunBeamColor(sunAltDeg: number): RGB {
  const m = sunAltDeg > 0 ? airMass(sunAltDeg) : MAX_AIR_MASS;
  const beam: RGB = [0, 0, 0];
  for (let c = 0; c < 3; c++) beam[c] = Math.exp(-(TAU_BLUE_ZENITH * BETA[c] + TAU_GREY) * m);
  const peak = Math.max(beam[0], beam[1], beam[2], 1e-9);
  return [beam[0] / peak, beam[1] / peak, beam[2] / peak];
}

/**
 * A vertical gradient for a window: the colour at the horizon, deepening
 * toward the zenith.
 */
export function skyGradient(sunAltDeg: number): string {
  const { horizon, zenith } = skyStops(sunAltDeg);
  return `linear-gradient(to top, ${cssRGB(horizon)} 0%, ${cssRGB(zenith)} 100%)`;
}