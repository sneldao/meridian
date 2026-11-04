import { sunSelfMoodWord, type SunSelfRead } from "@/domain/sun-self";
import { glassSunSvgGroup } from "./glass-sun-svg";

/* The sun-self as a standalone SVG string (round 24) — for surfaces that
 * must leave the DOM: the arrival passport export, the OG preview. One
 * geometry with the React component: the same twelve rays, the same halo
 * formula, the same disc — the domain read is the single source of
 * truth and both renderers just draw it. The face is retired (design
 * reset Phase 0): no eyes, lids or mouth in either renderer. The palette
 * is passed in because an exported image can't borrow the page's tokens. */

export interface SunSelfPalette {
  disc: string;
  rayLit: string;
  rayDim: string;
  halo: string;
}

export interface SunSelfSvgOptions {
  /** Radius of the disc in the target coordinate space. */
  r?: number;
  palette: SunSelfPalette;
}

/** A `<g>` centred on (0,0) — position it with an outer translate. The
 *  base geometry lives in the component's 120-box (face at 60,60, disc
 *  r=30); the chain recentres and scales it in one move. */
export function sunSelfSvgGroup(read: SunSelfRead, opts: SunSelfSvgOptions): string {
  const { palette } = opts;
  /* Delegates to the Phase-2 glass geometry so exported imagery shares the
     same body as the live instrument. The legacy four-colour palette maps
     onto the glass palette with honest stand-ins. */
  return glassSunSvgGroup(read, {
    r: opts.r,
    prefix: `exp-${read.rayCount}x${read.raysLit}`,
    palette: {
      rim: palette.rayDim,
      rimHi: "#fff8ef",
      core: palette.disc,
      coreSoft: palette.disc,
      halo: palette.halo,
      rayLit: palette.rayLit,
      rayDim: palette.rayDim,
      horizon: palette.rayLit,
    },
  });
}

/** Caption an exported glyph may carry — the mood word, nothing invented. */
export function sunSelfCaption(read: SunSelfRead): string {
  return `THE TRAVELLER'S MERIDIAN — ${sunSelfMoodWord(read.mood).toUpperCase()}`;
}
