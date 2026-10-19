import { fmtMin } from "@/domain/circadian";
import type { ArrivalRead } from "@/domain/arrival";
import { dayPlace } from "@/domain/today";
import type { CheckIn, Trip } from "@/domain/types";

// The numbers on the arrival screen, as data, so they can be asserted rather
// than eyeballed. Kept out of the component for the same reason as the eval
// chip: the arrival page makes claims about a real person's trip, and a claim
// that is only visible is a claim that will quietly drift.

export interface ArrivalRow {
  label: string;
  value: string;
  /** The honest qualifier — never let a headline number stand alone. */
  note?: string;
}

/** Hours to one decimal, matching the hero's residual phrasing. */
const hours = (min: number) => (Math.round(min / 6) / 10).toFixed(1);

export function arrivalRows(read: ArrivalRead, trip: Trip, checkIns: CheckIn[]): ArrivalRow[] {
  const rows: ArrivalRow[] = [];
  const { coverage } = read.promise ?? { coverage: null };

  if (coverage) {
    rows.push({
      label: "banked before you flew",
      value: `${Math.round(coverage.ratio * 100)}%`,
      note: `${hours(coverage.achievedMin)}h of the ${hours(coverage.requiredMin)}h shift`,
    });
    rows.push({
      label: coverage.complete ? "owed at landing" : "still owed on arrival",
      value: coverage.complete ? "0h" : `${hours(coverage.residualMin)}h`,
      note: coverage.complete
        ? "fully adapted"
        : `the crew kept working after touchdown`,
    });
    // The gate's mean plan score rides on the saved plan, not on coverage —
    // coverage answers "how much", score answers "how good".
    const gateScore = read.promise?.score;
    rows.push({
      label: "plan quality at the gate",
      value: gateScore === undefined ? "—" : gateScore.toFixed(2),
      note: `${coverage.daysPlanned} of ${coverage.daysTotal} days locked`,
    });
  } else {
    // No promise means no score. Saying "—" is the honest cell; filling in a
    // number here would be inventing a gate that never happened.
    rows.push({
      label: "banked before you flew",
      value: "—",
      note: "this trip's plan wasn't saved, so there's nothing to score against",
    });
  }

  rows.push({
    label: "steps you marked",
    value: String(read.followed),
    note: read.followRate === null
      ? "nothing marked yet"
      : `${Math.round(read.followRate * 100)}% followed · ${read.partial} partly · ${read.missed} missed`,
  });

  // What the body clock thought on arrival morning, if we know it.
  const arrivalCheck = checkIns.find((c) => c.dayIndex === trip.departureDayIndex + 1);
  if (arrivalCheck?.text) {
    rows.push({
      label: "on arrival morning",
      value: "noted",
      note: arrivalCheck.text.slice(0, 90),
    });
  }

  return rows;
}

/** The destination-local clock, for the header. */
export function destClockMin(trip: Trip, now: Date): number {
  const utcMin = now.getTime() / 60000;
  return Math.floor(((utcMin + trip.destination.utcOffsetMin) % 1440 + 1440) % 1440);
}

/** Where the traveller physically is on the trip's canonical day index — used
 *  to word "day N since landing" without inventing an index. */
export const arrivalCity = (trip: Trip) => dayPlace(trip, trip.departureDayIndex + 1).city;

/** Re-exported so the page formats the clock the same way the hero does. */
export { fmtMin };