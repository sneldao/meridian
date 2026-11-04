import type { SunSelfRead } from "@/domain/sun-self";
import { glassParams } from "./glass-sun";

/* Phase 2 — the glass sun's shared SVG body. One geometry for every
 * renderer: GlassSun's live DOM SVG, the OG/passport exports (via
 * sun-self-svg's delegate) and the static fallback the WebGL lens fails
 * back to. All geometry derives from the read through glassParams — no
 * randomness, no face, no user text inside the markup. The palette is
 * passed in: an exported image can't borrow the page's tokens.
 *
 * Base geometry (centred on 0,0): disc r=30, etched ticks at 33–37 just
 * outside the rim, halo r≤40 — the whole body fits a 120-box at r≤45
 * (the live render uses r=42: halo 40×scale sits inside the frame).
 * `raysLit` is the read-provided lit-tick count — we never recompute
 * the model or infer locked days.
 *
 * The fallback is beautiful glass in its own right: a thin prismatic
 * split rim, a curved refraction band over the warped horizon, a soft
 * attenuated core with a specular crescent, and etched caustic ticks for
 * the rays. */

export interface GlassSunPalette {
  rim: string;
  rimHi: string;
  core: string;
  coreSoft: string;
  halo: string;
  rayLit: string;
  rayDim: string;
  /** The warm horizon wash seen through the glass. */
  horizon: string;
}

/** Sanitise a prefix for SVG ids — only word chars, hyphens, colons. */
export function safeIdPrefix(p: string): string {
  return p.replace(/[^\w:-]/g, "_");
}

/** Escape a value going into a double-quoted SVG attribute — even for
 *  internally-trusted palettes, an attribute must never break out. */
const esc = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** A `<g>` centred on (0,0) — position with an outer transform. The base
 *  geometry lives in the 120-box the live glyph uses; callers scale. */
export function glassSunSvgGroup(
  read: SunSelfRead,
  opts: { r?: number; palette: GlassSunPalette; prefix: string },
): string {
  const p = glassParams(read);
  const pal = {
    rim: esc(opts.palette.rim),
    rimHi: esc(opts.palette.rimHi),
    core: esc(opts.palette.core),
    coreSoft: esc(opts.palette.coreSoft),
    halo: esc(opts.palette.halo),
    rayLit: esc(opts.palette.rayLit),
    rayDim: esc(opts.palette.rayDim),
    horizon: esc(opts.palette.horizon),
  };
  const id = safeIdPrefix(opts.prefix);
  const scale = (opts.r ?? 30) / 30;
  const a = read.tiltDeg;

  /* Etched caustic ticks at 33–37: short marks kissing the rim, lit count
     straight from the read. */
  const rays = Array.from({ length: p.rayCount }, (_, i) => {
    const lit = i < p.raysLit;
    return `<line x1="60" y1="23" x2="60" y2="27" class="${lit ? "sunself-ray lit" : "sunself-ray dim"}" stroke="${lit ? pal.rayLit : pal.rayDim}" stroke-width="2.5" stroke-linecap="round" transform="rotate(${i * 30} 60 60)"/>`;
  }).join("");

  const halo = (0.12 + read.glow * 0.5 + p.bloom * 0.3).toFixed(3);
  const coreOp = (0.08 + p.progress * 0.18).toFixed(3);
  const rimOp = (0.5 + p.roughness).toFixed(3);

  return `<g transform="rotate(${a}) scale(${scale.toFixed(3)}) translate(-60 -60)">
  <defs>
    <clipPath id="${id}-lens"><circle cx="60" cy="60" r="30"/></clipPath>
    <radialGradient id="${id}-core" cx="45%" cy="42%" r="62%">
      <stop offset="0" stop-color="${pal.core}" stop-opacity="${coreOp}"/>
      <stop offset="0.62" stop-color="${pal.coreSoft}" stop-opacity="0.08"/>
      <stop offset="1" stop-color="${pal.coreSoft}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id}-rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${pal.rimHi}" stop-opacity="${rimOp}"/>
      <stop offset="0.5" stop-color="${pal.rim}" stop-opacity="0.18"/>
      <stop offset="1" stop-color="${pal.rimHi}" stop-opacity="${(p.roughness * 0.9).toFixed(3)}"/>
    </linearGradient>
    <linearGradient id="${id}-hor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${pal.horizon}" stop-opacity="0"/>
      <stop offset="0.55" stop-color="${pal.horizon}" stop-opacity="${(0.14 + p.coreLight * 0.2).toFixed(3)}"/>
      <stop offset="1" stop-color="${pal.horizon}" stop-opacity="0"/>
    </linearGradient>
    <!-- Halo as a radial gradient: transparent centre, a faint ring that
         fades outward — the state formula feeds its outer stop. -->
    <radialGradient id="${id}-halo" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${pal.halo}" stop-opacity="0"/>
      <stop offset="0.7" stop-color="${pal.halo}" stop-opacity="${(Number(halo) * 0.7).toFixed(3)}"/>
      <stop offset="1" stop-color="${pal.halo}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  ${rays}
  <circle cx="60" cy="60" r="40" class="sunself-halo" fill="url(#${id}-halo)" data-halo="${halo}"/>
  <!-- Thick clear core: the attenuated disc, the warped horizon band seen
       through it, and the refraction arc curving off-axis. -->
  <circle cx="60" cy="60" r="30" class="sunself-disc" fill="url(#${id}-core)"/>
  <g clip-path="url(#${id}-lens)">
    <path d="M 26 64 C 45 41 71 72 94 54 L 94 59 C 71 77 45 46 26 69 Z" fill="url(#${id}-hor)"/>
    <path d="M 26 64 C 45 41 71 72 94 54" fill="none" stroke="${pal.horizon}" stroke-opacity="${(0.1 + p.progress * 0.18).toFixed(3)}" stroke-width="0.8"/>
  </g>
  <!-- Specular crescent — the off-axis softbox glint. -->
  <path d="M 40 44 A 24 24 0 0 1 62 34" fill="none" stroke="${pal.rimHi}" stroke-opacity="${(0.55 + p.coreLight * 0.3).toFixed(3)}" stroke-width="2" stroke-linecap="round"/>
  <!-- Thin prismatic rim: two offset strokes split the edge faintly. -->
  <circle cx="60" cy="60" r="29.4" fill="none" stroke="${pal.rimHi}" stroke-opacity="${(p.dispersion * 8).toFixed(3)}" stroke-width="1" transform="translate(${(-p.dispersion * 40).toFixed(2)} ${(-p.dispersion * 20).toFixed(2)})"/>
  <circle cx="60" cy="60" r="30" fill="none" stroke="url(#${id}-rim)" stroke-width="1.1"/>
</g>`;
}
