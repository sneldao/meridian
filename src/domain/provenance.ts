import type { Trip } from "@/domain/types";

/* Provenance chips (docs/plan/agent-native.md step 3) — the ContextCards
 * pattern applied to the plan header: one quiet row naming every signal
 * the plan used and what it contributed. The same disclosure law as the
 * EXAMPLE/FICTIONAL stamps — where things came from is visible — extended
 * to personalisation: a fixture calendar says "example meetings", a crate
 * that was never packed says so or stays absent.
 *
 * Facts arrive pre-computed. The crew's account rows are the record when
 * the commit that built the plan left one; a URL restore never had that
 * commit, so the row derives what the trip itself can prove (route gap,
 * direction, signed shift) and omits the rest — a chip exists only where
 * a fact exists, nothing is guessed. */

export interface ProvenanceChip {
  /** The signal's name — rendered as the chip's source tag. */
  source: string;
  /** What it contributed to the plan. */
  detail: string;
}

const hoursOf = (min: number) => (Math.abs(min) / 60).toFixed(1).replace(/\.0$/, "");

export function provenanceChips(input: {
  /** The trip the plan belongs to — the route chips' only source. Null
   *  means no plan, so no row. */
  trip: Pick<Trip, "requiredShiftMin" | "direction"> | null;
  /** Rows the crew's account produced at commit ({id, secondary}). When
   *  present, the light/conflicts/crate chips quote them verbatim — they
   *  are the record of what the plan build actually computed. */
  accountRows?: readonly { id: string; secondary: string }[] | null;
  /** Events the plan bent around. */
  calendarCount: number;
  /** "google" names the traveller's own calendar; anything else is the
   *  fixture — the chip says "example meetings" rather than borrowing the
   *  user's authority (the disclosure law extends to personalisation). */
  calendarSource?: "google" | "fixture";
  /** The crate fact when no account row carries it: entities packed, and
   *  the places they produced when a resolved itinerary knows. Null (or
   *  absent) means the crate's contents can't be honestly named — the
   *  chip stays off the row. */
  crate?: { entities: number; places?: number } | null;
}): ProvenanceChip[] {
  const { trip } = input;
  if (!trip) return [];

  const chips: ProvenanceChip[] = [];
  const gap = Math.abs(trip.requiredShiftMin);
  const hours = hoursOf(trip.requiredShiftMin);

  /* The route as the gap functions read it: magnitude + direction. A
   * zero-shift route owes nothing — direction would be invented. */
  chips.push({
    source: "Route",
    detail: gap ? `${hours}h ${trip.direction}bound` : "no shift owed",
  });
  /* The body's signed offset — eastbound shifts are negative, so the chip
   * lands your body that many hours behind the destination's clock. */
  if (gap) {
    chips.push({
      source: "Body clock",
      detail: `${trip.requiredShiftMin < 0 ? "−" : "+"}${hours}h`,
    });
  }

  const row = (id: string) => input.accountRows?.find((r) => r.id === id)?.secondary;
  const light = row("light");
  if (light) chips.push({ source: "Light", detail: light });
  const conflicts = row("conflicts");
  if (conflicts) chips.push({ source: "Conflicts", detail: conflicts });

  const crateRow = row("crate");
  if (crateRow) {
    chips.push({ source: "Crate", detail: crateRow });
  } else if (input.crate) {
    const { entities, places } = input.crate;
    chips.push({
      source: "Crate",
      detail: entities
        ? `${entities} ${entities === 1 ? "entity" : "entities"}` +
          (places != null ? ` · ${places} ${places === 1 ? "place" : "places"}` : "")
        : "none packed",
    });
  }

  const unit = input.calendarSource === "google" ? "meetings" : "example meetings";
  chips.push({
    source: "Calendar",
    detail: input.calendarCount === 0 ? "none" : `${input.calendarCount} ${unit}`,
  });

  return chips;
}
