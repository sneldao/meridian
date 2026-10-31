import type { SunSelfRead } from "@/domain/sun-self";
import { sunSelfSvgGroup, sunSelfCaption } from "@/lib/sun-self-svg";
import { DOCUMENT_PALETTE } from "@/lib/arrival-passport-svg";

/* The body-clock portrait (round 25) — the Wrapped-style artifact: one
 * shareable state-portrait, not a data dump. The face IS the card: big,
 * centred, honest. Everything on it is passed in by a caller that computed
 * it (the arrival read, the demo journey) — the portrait invents nothing,
 * and a traveller with no read gets no portrait.
 *
 * Square (1080×1080) for social crops; same document palette as the
 * passport so the two artifacts read as one family. */

const W = 1080;
const H = 1080;

const { ink, ink2, paper, muted, gold, goldDim } = DOCUMENT_PALETTE;

const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrap(text: string, budget: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > budget) {
      lines.push(line);
      line = w;
    } else {
      line = line ? line + " " + w : w;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

export interface SunPortraitInput {
  /** The computed face — never authored, never invented. */
  read: SunSelfRead;
  /** The route as the passport writes it, e.g. "LONDON → TOKYO". */
  routeLabel: string;
  /** Optional second line the caller's numbers support, e.g. the banked
   *  shift — rendered only when provided. */
  subLabel?: string;
}

export function sunPortraitSvg({ read, routeLabel, subLabel }: SunPortraitInput): string {
  const lineWords = wrap(read.line, 44);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${ink}"/>
      <stop offset="0.72" stop-color="${ink2}"/>
      <stop offset="1" stop-color="${ink2}"/>
    </linearGradient>
    <radialGradient id="dawn" cx="0.5" cy="0.55" r="0.62">
      <stop offset="0" stop-color="${gold}" stop-opacity="${(0.1 + read.glow * 0.22).toFixed(3)}"/>
      <stop offset="0.6" stop-color="${gold}" stop-opacity="0.05"/>
      <stop offset="1" stop-color="${gold}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#dawn)"/>

  <!-- passport frame, so the family reads at a glance -->
  <rect x="48" y="48" width="${W - 96}" height="${H - 96}" rx="26" fill="none"
    stroke="${goldDim}" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="2 9"/>

  <!-- eyebrow + route -->
  <text x="540" y="150" text-anchor="middle" font-family="${MONO}" font-size="24"
    font-weight="700" letter-spacing="8" fill="${gold}">${esc("MERIDIAN · BODY-CLOCK PORTRAIT")}</text>
  <text x="540" y="228" text-anchor="middle" font-family="${SERIF}" font-size="58"
    font-weight="700" fill="${paper}" letter-spacing="-1">${esc(routeLabel)}</text>

  <!-- the face is the card -->
  <g transform="translate(540 520)">
    ${sunSelfSvgGroup(read, {
      r: 200,
      palette: { disc: gold, face: ink, rayLit: gold, rayDim: muted, halo: gold },
    })}
  </g>

  <!-- the honest one-liner, from the same read -->
  ${lineWords
    .map(
      (l, i) => `<text x="540" y="${812 + i * 46}" text-anchor="middle" font-family="${SERIF}"
    font-size="34" fill="${paper}">${esc(l)}</text>`,
    )
    .join("\n  ")}
  ${
    subLabel
      ? `<text x="540" y="${812 + lineWords.length * 46 + 8}" text-anchor="middle" font-family="${MONO}"
    font-size="24" letter-spacing="2" fill="${muted}">${esc(subLabel.toUpperCase())}</text>`
      : ""
  }

  <!-- caption + footer -->
  <text x="540" y="976" text-anchor="middle" font-family="${MONO}" font-size="20"
    letter-spacing="4" fill="${muted}">${esc(sunSelfCaption(read))}</text>
  <text x="96" y="${H - 72}" font-family="${MONO}" font-size="18" letter-spacing="2"
    fill="${muted}" fill-opacity="0.85">${esc("TIMING GUIDANCE, NOT MEDICAL ADVICE")}</text>
  <text x="${W - 96}" y="${H - 72}" text-anchor="end" font-family="${SERIF}" font-size="24"
    font-style="italic" fill="${goldDim}">${esc("meridian")}</text>
</svg>`;
}

export const SUN_PORTRAIT_SIZE = { width: W, height: H };
