import type { ArrivalRead } from "@/domain/arrival";
import type { Trip } from "@/domain/types";

// The arrival passport — the trip's payoff, stamped.
//
// The arrival screen is where the product's promise gets settled; the
// passport is the one artifact from it worth sending someone. So it obeys the
// same honesty rule as every arrival number: it only stamps what the read
// actually carries. No projection and no gate promise means no passport —
// never a stamped card with invented figures.

export type ArrivalStamp = "ADJUSTED" | "ALMOST" | "OWED";

export interface ArrivalPassport {
  /** "LONDON → TOKYO" — city names from the trip, uppercased on the card. */
  route: string;
  /** "20 OCT 2026" — the destination arrival date, or null when the trip
   *  carries none (a passport with a guessed date would be a lie in a font). */
  landedOn: string | null;
  stamp: ArrivalStamp;
  /** The stamp's qualifier: what the verdict is about, as a short phrase. */
  stampDetail: string;
  /** The headline figure — projection hours or the banked percentage. */
  stat: string;
  /** What that figure measures, plainly. */
  statLabel: string;
  /** The honest comparison line under the figure. */
  statSub: string;
  /** "2 followed · 1 partial · 0 missed" — only when marks exist. */
  marksLine: string | null;
}

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/** "2026-10-20" → "20 OCT 2026". Stable across locales because a passport
 *  date that shifts with the viewer's region is not a record. */
export function passportDate(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

const hours1 = (min: number) => (Math.round(min / 6) / 10).toFixed(1);

export function arrivalPassport(read: ArrivalRead, trip: Trip): ArrivalPassport | null {
  const route = `${trip.origin.name} → ${trip.destination.name}`.toUpperCase();
  const arrivalSpec = trip.days.find((d) => d.dayIndex === trip.departureDayIndex + 1);
  const landedOn = arrivalSpec?.date ? passportDate(arrivalSpec.date) : null;

  const marksLine =
    read.followRate === null
      ? null
      : `${read.followed} followed · ${read.partial} partial · ${read.missed} missed`;

  // The model first: a projection is what the body clock actually does at
  // landing, so when it's on file it outranks the gate's claim.
  const p = read.projection;
  if (p) {
    const stamp: ArrivalStamp = p.hours <= 1.05 ? "ADJUSTED" : p.hours <= 3 ? "ALMOST" : "OWED";
    return {
      route,
      landedOn,
      stamp,
      stampDetail:
        stamp === "ADJUSTED"
          ? `${p.hours.toFixed(1)}h off local — within a good night`
          : `${p.hours.toFixed(1)}h off local time`,
      stat: `${p.hours.toFixed(1)}h`,
      statLabel: "body clock at landing, from local midnight",
      statSub: `the plan carried ${p.deliveredHours.toFixed(1)}h of ${p.requiredHours.toFixed(1)} · doing nothing would have left ${p.baselineHours.toFixed(1)}h`,
      marksLine,
    };
  }

  // No model, but the gate made a promise — stamp the promise.
  const coverage = read.promise?.coverage;
  if (coverage) {
    const stamp: ArrivalStamp =
      coverage.residualMin <= 0 ? "ADJUSTED" : coverage.ratio >= 0.5 ? "ALMOST" : "OWED";
    return {
      route,
      landedOn,
      stamp,
      stampDetail:
        stamp === "ADJUSTED"
          ? "fully banked before the flight"
          : `${hours1(coverage.residualMin)}h still owed at landing`,
      stat: `${Math.round(coverage.ratio * 100)}%`,
      statLabel: "of the shift banked before you flew",
      statSub: `${hours1(coverage.achievedMin)}h of ${hours1(coverage.requiredMin)}h · promised at the gate`,
      marksLine,
    };
  }

  // Neither — nothing honest to stamp.
  return null;
}

/** The shareable plain-text form: the same record, minus the ink. */
export function passportText(pp: ArrivalPassport): string {
  const lines = [
    "MERIDIAN · ARRIVAL RECORD",
    `${pp.route}${pp.landedOn ? ` · ${pp.landedOn}` : ""}`,
    `${pp.stamp} — ${pp.stampDetail}`,
    `${pp.stat} ${pp.statLabel}`,
    pp.statSub,
  ];
  if (pp.marksLine) lines.push(pp.marksLine);
  lines.push("Timing guidance, not medical advice · meridian");
  return lines.join("\n");
}
