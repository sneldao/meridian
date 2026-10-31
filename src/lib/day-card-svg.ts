import type { PublicDayCard } from "@/lib/day-card";

const escapeXml = (v: string) =>
  v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

function glyphUnits(ch: string): number {
  if (ch === " ") return 0.3;
  return /[a-zA-Z0-9]/.test(ch) ? 0.6 : 1.0;
}

function wrapText(text: string, fontSize: number, widthPx: number, maxLines: number): string[] {
  const budget = widthPx / fontSize;
  const words = Array.from(text).join("").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  let units = 0;
  const pushWord = (word: string) => {
    const wu = Array.from(word).reduce((sum, c) => sum + glyphUnits(c), 0) + 0.3;
    if (units + wu > budget && line) {
      lines.push(line);
      line = word;
      units = wu;
    } else {
      line = line ? `${line} ${word}` : word;
      units += wu;
    }
    while (units > budget) {
      let cut = "";
      let cu = 0;
      for (const c of Array.from(line)) {
        if (cu + glyphUnits(c) > budget) break;
        cut += c;
        cu += glyphUnits(c);
      }
      lines.push(cut);
      line = Array.from(line).slice(Array.from(cut).length).join("");
      units = Array.from(line).reduce((sum, c) => sum + glyphUnits(c), 0);
    }
  };
  for (const w of words) pushWord(w);
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const tail = Array.from(kept[maxLines - 1]);
    kept[maxLines - 1] = tail.slice(0, -1).join("") + "…";
    return kept;
  }
  return lines;
}

const T = (x: number, y: number, size: number, fill: string, weight: number, family: string, text: string) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" font-family="${family}">${escapeXml(text)}</text>`;

const SERIF = "Georgia, 'Times New Roman', serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";
const BODY = "'Helvetica Neue', Helvetica, Arial, sans-serif";

const PAPER = "#e8eaf2";
const MUTED = "#b8c0d0";
const GOLD = "#ffc46b";
const TERRA = "#d96b43";

export function dayCardSvg(card: PublicDayCard, section?: 0 | 1 | 2): string {
  const parts: string[] = [];
  parts.push(`<defs><radialGradient id="halo" cx="0.82" cy="0.08" r="0.55">
      <stop offset="0" stop-color="${TERRA}" stop-opacity="0.85"/>
      <stop offset="0.45" stop-color="${GOLD}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${GOLD}" stop-opacity="0"/>
    </radialGradient></defs>`);
  parts.push(`<rect width="1080" height="1920" fill="#07090f"/><rect width="1080" height="1920" fill="url(#halo)"/>`);
  parts.push(T(88, 100, 40, PAPER, 700, SERIF, "MERIDIAN"));
  parts.push(T(88, 152, 20, MUTED, 400, MONO, "YOUR PLANNED DAY"));

  const chapter = (sec: { eyebrow: string; title: string; lines: string[] }, top: number, big: boolean) => {
    parts.push(`<line x1="88" y1="${top}" x2="140" y2="${top}" stroke="${GOLD}" stroke-width="3"/>`);
    parts.push(T(88, top + 34, big ? 20 : 18, MUTED, 400, MONO, sec.eyebrow.toUpperCase()));
    let ty = top + (big ? 120 : 92);
    for (const line of wrapText(sec.title, big ? 72 : 46, 904, big ? 3 : 2)) {
      parts.push(T(88, ty, big ? 72 : 46, PAPER, 600, SERIF, line));
      ty += big ? 84 : 54;
    }
    ty += big ? 24 : 16;
    for (const line of wrapText(sec.lines.join(" · "), big ? 30 : 24, 904, big ? 6 : 4)) {
      parts.push(T(88, ty, big ? 30 : 24, MUTED, 400, BODY, line));
      ty += big ? 42 : 30;
    }
  };

  let cy = 260;
  for (const line of wrapText(card.city, 88, 904, 2)) {
    parts.push(T(88, cy, 88, PAPER, 600, SERIF, line));
    cy += 96;
  }
  parts.push(T(88, 380, 24, MUTED, 400, MONO, `${card.status}${card.dateLabel ? ` · ${card.dateLabel}` : ""}`));

  if (section === undefined) {
    chapter(card.sections[0], 460, false);
    chapter(card.sections[1], 780, false);
    chapter(card.sections[2], 1100, false);
  } else {
    const sec = card.sections[section];
    parts.push(`<line x1="88" y1="560" x2="200" y2="560" stroke="${GOLD}" stroke-width="4"/>`);
    parts.push(T(88, 610, 24, MUTED, 400, MONO, sec.eyebrow.toUpperCase()));
    let ty = 710;
    for (const line of wrapText(sec.title, 72, 904, 3)) {
      parts.push(T(88, ty, 72, PAPER, 600, SERIF, line));
      ty += 84;
    }
    ty += 30;
    for (const line of wrapText(sec.lines.join(" · "), 30, 904, 6)) {
      parts.push(T(88, ty, 30, MUTED, 400, BODY, line));
      ty += 42;
    }
  }

  const noticeSizes = [
    { size: 20, line: 27, gap: 8 },
    { size: 18, line: 24, gap: 4 },
  ];
  let noticeLayout = noticeSizes[0];
  for (const layout of noticeSizes) {
    const total = card.notices.reduce(
      (sum, n) => sum + wrapText(n, layout.size, 904, 8).length * layout.line + layout.gap,
      0,
    );
    if (total <= 1860 - 1480) {
      noticeLayout = layout;
      break;
    }
    noticeLayout = noticeSizes[noticeSizes.length - 1];
  }
  let ny = 1480;
  for (const notice of card.notices) {
    for (const line of wrapText(notice, noticeLayout.size, 904, 8)) {
      parts.push(T(88, ny, noticeLayout.size, MUTED, 400, BODY, line));
      ny += noticeLayout.line;
    }
    ny += noticeLayout.gap;
  }

  const visibleSections = section === undefined ? card.sections : [card.sections[section]];
  const descText = [
    `${card.status}${card.dateLabel ? ` ${card.dateLabel}` : ""} ${card.city}`,
    ...visibleSections.flatMap((s) => [`${s.eyebrow} ${s.title}`, ...s.lines]),
    ...card.notices,
  ].join(". ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920" role="img"><title>${escapeXml(`Meridian planned day · ${card.city}`)}</title><desc>${escapeXml(descText)}</desc>${parts.join("")}</svg>`;
}
