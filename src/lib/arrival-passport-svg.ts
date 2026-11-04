import type { ArrivalPassport } from "@/domain/arrival-passport";
import type { SunSelfRead } from "@/domain/sun-self";
import { sunSelfCaption, sunSelfSvgGroup } from "@/lib/sun-self-svg";

// The arrival passport as a standalone SVG — the same export pipeline the day
// card uses (SVG string → <img> → canvas → PNG), so the landing can leave the
// app as an image. The palette is the arrival stage's own: ink, the gold of
// the horizon band, and the stamp red for a verdict the body owes.
//
// System font stacks only — an exported image can't borrow the app's fonts,
// and a serif/mono pairing reads as a document rather than a screenshot.

const W = 1080;
const H = 1350;

/* The document palette (round 24): ink, the gold of the horizon band, and the
 * stamp red for a verdict the body owes. Exported so every artifact that
 * leaves the app — passport, portrait — reads as the same document family. */
export const DOCUMENT_PALETTE = {
  ink: "#0b0e16",
  ink2: "#0c1220",
  paper: "#f4f0e8",
  muted: "#8b93a7",
  gold: "#ffd98a",
  goldDim: "#b99a5e",
  stampRed: "#ff7a7a",
} as const;

const INK = DOCUMENT_PALETTE.ink;
const INK_2 = DOCUMENT_PALETTE.ink2;
const PAPER = DOCUMENT_PALETTE.paper;
const MUTED = DOCUMENT_PALETTE.muted;
const GOLD = DOCUMENT_PALETTE.gold;
const GOLD_DIM = DOCUMENT_PALETTE.goldDim;
const STAMP_RED = DOCUMENT_PALETTE.stampRed;

const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Wrap a line at a rough character budget, breaking on spaces. */
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
  return lines;
}

const stampColor = (stamp: ArrivalPassport["stamp"]) =>
  stamp === "ADJUSTED" ? GOLD : stamp === "ALMOST" ? PAPER : STAMP_RED;

export function arrivalPassportSvg(pp: ArrivalPassport, sun?: SunSelfRead): string {
  const color = stampColor(pp.stamp);
  const statLines = pp.stat;
  const subLines = wrap(pp.statSub, 52);
  const marks = pp.marksLine;

  // The stamp — a pressed-in verdict, rotated like ink on a page. It sits
  // beside the figure, below the route/date lines, so long route names
  // ("LONDON → TOKYO" at display size) can never run underneath it.
  const stampY = 500;
  // The detail wraps inside the stamp's inner frame — a truncated verdict
  // would be its own small lie.
  const detailLines = wrap(pp.stampDetail, 24).slice(0, 2);
  const wordY = detailLines.length > 1 ? stampY - 16 : stampY - 6;
  const detailYs = detailLines.length > 1 ? [stampY + 26, stampY + 50] : [stampY + 40];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INK}"/>
      <stop offset="0.72" stop-color="${INK_2}"/>
      <stop offset="1" stop-color="${INK_2}"/>
    </linearGradient>
    <radialGradient id="dawn" cx="0.5" cy="1.06" r="0.9">
      <stop offset="0" stop-color="${GOLD}" stop-opacity="0.30"/>
      <stop offset="0.5" stop-color="${GOLD}" stop-opacity="0.08"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <rect width="${W}" height="${H}" fill="url(#dawn)"/>
  <ellipse cx="${W / 2}" cy="${H + 40}" rx="640" ry="6" fill="${GOLD}" opacity="0.5"/>

  <!-- passport frame -->
  <rect x="56" y="56" width="${W - 112}" height="${H - 112}" rx="26" fill="none"
    stroke="${GOLD_DIM}" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="2 9"/>
  <rect x="76" y="76" width="${W - 152}" height="${H - 152}" rx="18" fill="none"
    stroke="${GOLD_DIM}" stroke-opacity="0.22" stroke-width="1.5"/>

  <!-- eyebrow -->
  <text x="120" y="172" font-family="${MONO}" font-size="27" font-weight="700"
    letter-spacing="9" fill="${GOLD}">${esc("MERIDIAN · ARRIVAL RECORD")}</text>

  <!-- route -->
  <text x="120" y="280" font-family="${SERIF}" font-size="76" font-weight="700"
    fill="${PAPER}" letter-spacing="-1">${esc(pp.route)}</text>
  <text x="120" y="${pp.landedOn ? 338 : 322}" font-family="${MONO}" font-size="27"
    letter-spacing="4" fill="${MUTED}">${pp.landedOn ? esc(`LANDED ${pp.landedOn}`) : esc("LANDED")}</text>

  <!-- the stamp -->
  <g transform="rotate(-8 ${W - 300} ${stampY})">
    <rect x="${W - 470}" y="${stampY - 86}" width="340" height="150" rx="14"
      fill="none" stroke="${color}" stroke-opacity="0.9" stroke-width="6"/>
    <rect x="${W - 458}" y="${stampY - 74}" width="316" height="126" rx="8"
      fill="none" stroke="${color}" stroke-opacity="0.4" stroke-width="2"/>
    <text x="${W - 300}" y="${wordY}" text-anchor="middle" font-family="${MONO}"
      font-size="58" font-weight="800" letter-spacing="10" fill="${color}">${esc(pp.stamp)}</text>
    ${detailLines
      .map(
        (l, i) => `<text x="${W - 300}" y="${detailYs[i]}" text-anchor="middle" font-family="${MONO}"
      font-size="20" letter-spacing="1" fill="${color}" fill-opacity="0.85">${esc(l)}</text>`,
      )
      .join("\n    ")}
  </g>

  <!-- the figure -->
  <text x="120" y="560" font-family="${SERIF}" font-size="190" font-weight="700"
    fill="${GOLD}" letter-spacing="-4">${esc(statLines)}</text>
  <text x="120" y="626" font-family="${MONO}" font-size="27" letter-spacing="3"
    fill="${PAPER}">${esc(pp.statLabel.toUpperCase())}</text>
  ${subLines
    .map(
      (l, i) => `<text x="120" y="${690 + i * 44}" font-family="${SERIF}" font-size="30"
    fill="${MUTED}">${esc(l)}</text>`,
    )
    .join("\n  ")}

  <!-- the traveller's meridian — the same glyph the stage sky shows, computed
       from this trip's debt and banked shift: an export is a portrait, not a logo -->
  ${
    sun
      ? `<g transform="translate(${W - 250} 690)">
    ${sunSelfSvgGroup(sun, { r: 88, palette: { disc: GOLD, rayLit: GOLD, rayDim: MUTED, halo: GOLD } })}
  </g>
  <text x="${W - 250}" y="816" text-anchor="middle" font-family="${MONO}" font-size="20"
    letter-spacing="3" fill="${MUTED}">${esc(sunSelfCaption(sun))}</text>`
      : ""
  }

  <!-- the traveller's own account -->
  ${
    marks
      ? `<line x1="120" y1="880" x2="${W - 120}" y2="880" stroke="${GOLD_DIM}" stroke-opacity="0.35" stroke-width="1.5"/>
  <text x="120" y="948" font-family="${MONO}" font-size="24" letter-spacing="5"
    fill="${MUTED}">${esc("THE TRAVELLER'S ACCOUNT")}</text>
  <text x="120" y="1006" font-family="${SERIF}" font-size="38"
    fill="${PAPER}">${esc(marks)}</text>`
      : ""
  }

  <!-- footer -->
  <text x="120" y="${H - 150}" font-family="${MONO}" font-size="22" letter-spacing="2"
    fill="${MUTED}" fill-opacity="0.85">${esc("TIMING GUIDANCE, NOT MEDICAL ADVICE")}</text>
  <text x="${W - 120}" y="${H - 150}" text-anchor="end" font-family="${SERIF}" font-size="26"
    font-style="italic" fill="${GOLD_DIM}">${esc("meridian")}</text>
</svg>`;
}

export const ARRIVAL_PASSPORT_SIZE = { width: W, height: H };
