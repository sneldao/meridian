import { describe, expect, test } from "bun:test";
import { buildTrip, GARMIN_BASELINE } from "@/domain/fixtures";
import type { TripData } from "@/domain/types";
import { writeTripTaste } from "@/lib/use-trip-taste";
import { buildTripAccountRows, validateTripPayload } from "@/lib/trip-account";
import { withStubbedGlobal } from "./stub-global";

/* The crew's account, extracted from the Home fetch effect: the payload
 * check and the three account rows are pure functions of the payload. */

const DEPARTURE = "2026-11-09";

function payload(): { data: TripData; depDate: string } {
  const trip = buildTrip("LHR", "HND", DEPARTURE);
  const depDate = trip.days[trip.departureDayIndex]?.date ?? DEPARTURE;
  return {
    data: { trip, baseline: GARMIN_BASELINE, calendar: [], provider: "test" },
    depDate,
  };
}

/** In-memory Storage for the crate read — bun has no localStorage. */
function mockStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  };
}

const withStorage = (storage: unknown, fn: () => void) =>
  withStubbedGlobal("localStorage", storage, fn);

describe("validateTripPayload", () => {
  test("accepts the route and date that were asked for", () => {
    const { data, depDate } = payload();
    expect(
      validateTripPayload(data, { origin: "LHR", dest: "HND", departureDate: depDate }),
    ).toBe(true);
  });

  test("rejects a swapped destination and a moved date", () => {
    const { data, depDate } = payload();
    expect(
      validateTripPayload(data, { origin: "LHR", dest: "JFK", departureDate: depDate }),
    ).toBe(false);
    expect(
      validateTripPayload(data, { origin: "LHR", dest: "HND", departureDate: "2030-01-01" }),
    ).toBe(false);
  });
});

describe("buildTripAccountRows", () => {
  test("closes the account in order: light, conflicts, crate", () => {
    const { data, depDate } = payload();
    let rows!: ReturnType<typeof buildTripAccountRows>;
    withStorage(mockStorage(), () => {
      rows = buildTripAccountRows(data, {
        origin: "LHR",
        dest: "HND",
        departureDate: depDate,
        wakeBand: null,
      });
    });
    expect(rows.map((r) => r.id)).toEqual(["light", "conflicts", "crate"]);
    expect(rows[0].secondary).toMatch(/across|none placed|could not place/);
    expect(rows[1].secondary).toMatch(/none|flagged|needs the crew/);
    expect(rows[2].secondary).toBe("no crate packed");
  });

  test("a packed crate without a sample match stays honest", () => {
    const { data, depDate } = payload();
    const storage = mockStorage();
    writeTripTaste(storage, "LHR-HND-" + depDate, [
      { id: "ramen-ichi", name: "Ramen Ichi", type: "brand" },
    ]);
    let rows!: ReturnType<typeof buildTripAccountRows>;
    withStorage(storage, () => {
      rows = buildTripAccountRows(data, {
        origin: "LHR",
        dest: "HND",
        departureDate: depDate,
        wakeBand: null,
      });
    });
    expect(rows[2].secondary).toContain("places resolve with the crew");
  });
});
