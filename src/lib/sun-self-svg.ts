import { sunSelfMoodWord, type SunSelfRead } from "@/domain/sun-self";

/* The sun-self as a standalone SVG string (round 24) — for surfaces that
 * must leave the DOM: the arrival passport export, the OG preview. One
 * geometry with the React component: the same lid law, the same twelve
 * rays, the same halo formula — the domain read is the single source of
 * truth and both renderers just draw it. The palette is passed in because
 * an exported image can't borrow the page's tokens. */

export interface SunSelfPalette {
  disc: string;
  face: string;
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
  const scale = (opts.r ?? 30) / 30;

  const rays = Array.from({ length: read.rayCount }, (_, i) => {
    const lit = i < read.raysLit;
    return `<line x1="60" y1="10" x2="60" y2="18" stroke="${lit ? palette.rayLit : palette.rayDim}" stroke-width="3" stroke-linecap="round" transform="rotate(${i * 30} 60 60)"/>`;
  }).join("");

  // The lid law mirrors the component: the ellipse thins with debt; below
  // the threshold we draw the closed lid — a gentle arc, never a grimace.
  const ry = Math.max(0.5, 4.2 * (1 - read.lid));
  const closed = ry < 1.15;
  const eyes = closed
    ? `<path d="M 44 56 Q 48 59.5 52 56" fill="none" stroke="${palette.face}" stroke-width="2.6" stroke-linecap="round"/>
     <path d="M 68 56 Q 72 59.5 76 56" fill="none" stroke="${palette.face}" stroke-width="2.6" stroke-linecap="round"/>`
    : `<ellipse cx="48" cy="56" rx="3.4" ry="${ry.toFixed(2)}" fill="${palette.face}"/>
     <ellipse cx="72" cy="56" rx="3.4" ry="${ry.toFixed(2)}" fill="${palette.face}"/>`;

  const smile =
    read.mood === "adjusted" ? 3.2 : read.mood === "half-lit" ? 2.4 : read.mood === "lifting" ? 1.4 : 0.4;

  return `<g transform="rotate(${read.tiltDeg}) scale(${scale.toFixed(3)}) translate(-60 -60)">
    ${rays}
    <circle cx="60" cy="60" r="40" fill="${palette.halo}" opacity="${(0.12 + read.glow * 0.5).toFixed(3)}"/>
    <circle cx="60" cy="60" r="30" fill="${palette.disc}"/>
    ${eyes}
    <path d="M 53 71 Q 60 ${(71 + smile).toFixed(1)} 67 71" fill="none" stroke="${palette.face}" stroke-width="2.6" stroke-linecap="round"/>
  </g>`;
}

/** Caption an exported face may carry — the mood word, nothing invented. */
export function sunSelfCaption(read: SunSelfRead): string {
  return `THE TRAVELLER'S MERIDIAN — ${sunSelfMoodWord(read.mood).toUpperCase()}`;
}
