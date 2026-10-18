import { findAirport } from "@/domain/airports";

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const MONTH_IDX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function monthIndex(word: string): number {
  const w = word.toLowerCase();
  return MONTH_IDX[w] ?? MONTH_IDX[w.slice(0, 3)] ?? -1;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** First date-like mention in a confirmation email. Yearless dates roll to
 *  their next occurrence on/after `now`. */
function parseDate(text: string, now: Date): string | null {
  let m = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);

  // "21 Oct 2026" / "21 October 2026" (weekday prefixes ignored)
  m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\s*,?\\s+(\\d{4})\\b`, "i"));
  if (m) return iso(+m[3], monthIndex(m[2]) + 1, +m[1]);

  // "Oct 21, 2026" / "October 21 2026"
  m = text.match(new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s+(\\d{4})\\b`, "i"));
  if (m) return iso(+m[3], monthIndex(m[1]) + 1, +m[2]);

  // "21/10/2026" — day first, UK booking convention
  m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m) return iso(+m[3], +m[2], +m[1]);

  // Yearless: "Wed 21 Oct" / "21 Oct" / "Oct 21"
  m =
    text.match(new RegExp(`\\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\b`, "i")) ??
    text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\b(?!\\s*,?\\s*\\d)`, "i")) ??
    text.match(new RegExp(`\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*,?\\s*\\d{4})`, "i"));
  if (m) {
    const day = +m[1];
    const mon = monthIndex(m[2]);
    if (mon < 0) return null;
    for (let y = now.getFullYear(); y <= now.getFullYear() + 1; y++) {
      const cand = new Date(Date.UTC(y, mon, day));
      const todayUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
      if (cand >= todayUtc) return iso(y, mon + 1, day);
    }
  }
  return null;
}

/** Pulls a route out of pasted booking text: the first two distinct known
 *  IATA codes are origin/destination; the first date-like string is the
 *  departure date. Returns null unless all three resolve. */
export function parseBooking(
  text: string,
  now: Date,
): { origin: string; dest: string; date: string } | null {
  const codes: string[] = [];
  for (const m of text.matchAll(/\(([A-Z]{3})\)|\b([A-Z]{3})\b/g)) {
    const code = m[1] ?? m[2];
    if (findAirport(code) && !codes.includes(code)) codes.push(code);
    if (codes.length === 2) break;
  }
  const date = parseDate(text, now);
  if (codes.length < 2 || !date) return null;
  return { origin: codes[0], dest: codes[1], date };
}
