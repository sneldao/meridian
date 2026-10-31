import { describe, expect, test } from "bun:test";
import { restorePlan } from "../src/lib/restore-plan";
import { buildTrip } from "../src/domain/fixtures";
import type { DayPlan } from "../src/domain/types";

const trip = buildTrip("LHR", "HND", "2026-05-10");
const depDate = trip.days.find((d) => d.dayIndex === trip.departureDayIndex)!.date;
const route = { origin: "LHR", dest: "HND", date: depDate };

const day = (label: string): DayPlan =>
  ({
    label,
    dayIndex: 0,
    shiftMin: 30,
    targetWakeMin: 420,
    targetBedtimeMin: 1320,
    interventions: [],
    notes: "",
  }) as unknown as DayPlan;

const plan = JSON.stringify({ days: [day("D-3"), day("D-2"), day("D-1")] });
const tripRaw = JSON.stringify(trip);

describe("restorePlan", () => {
  test("matching plan + trip returns the days keyed by label", () => {
    const res = restorePlan(plan, tripRaw, route);
    expect(res).not.toBeNull();
    expect([...res!.locked.keys()]).toEqual(["D-3", "D-2", "D-1"]);
    expect(res!.locked.get("D-2")!.shiftMin).toBe(30);
    expect(res!.citations).toEqual([]);
  });

  test("a different route restores nothing", () => {
    expect(restorePlan(plan, tripRaw, { ...route, dest: "JFK" })).toBeNull();
    expect(restorePlan(plan, tripRaw, { ...route, origin: "SFO" })).toBeNull();
  });

  test("a different departure date restores nothing", () => {
    expect(restorePlan(plan, tripRaw, { ...route, date: "2026-05-11" })).toBeNull();
  });

  test("corrupt JSON restores nothing", () => {
    expect(restorePlan("{oops", tripRaw, route)).toBeNull();
    expect(restorePlan(plan, "{oops", route)).toBeNull();
  });

  test("an empty days array restores nothing", () => {
    expect(restorePlan(JSON.stringify({ days: [] }), tripRaw, route)).toBeNull();
  });

  test("baseline provenance rides along when the plan carries it", () => {
    const withKind = JSON.stringify({
      days: [day("D-3")],
      baselineKind: "wake-band",
    });
    expect(restorePlan(withKind, tripRaw, route)?.baselineKind).toBe("wake-band");
    const garmin = JSON.stringify({ days: [day("D-3")], baselineKind: "garmin" });
    expect(restorePlan(garmin, tripRaw, route)?.baselineKind).toBe("garmin");
  });

  test("old saves carry no provenance — undefined, never invented", () => {
    expect(restorePlan(plan, tripRaw, route)?.baselineKind).toBeUndefined();
    const bogus = JSON.stringify({ days: [day("D-3")], baselineKind: "satellite" });
    expect(restorePlan(bogus, tripRaw, route)?.baselineKind).toBeUndefined();
  });

  test("null inputs restore nothing", () => {
    expect(restorePlan(null, tripRaw, route)).toBeNull();
    expect(restorePlan(plan, null, route)).toBeNull();
    expect(restorePlan(null, null, route)).toBeNull();
  });
});

import type { TasteItinerary } from "../src/domain/taste";

const itinerary = (over: Partial<TasteItinerary> = {}): TasteItinerary => ({
  destinationCode: "HND",
  destination: "Tokyo",
  departureDate: depDate,
  favorites: [{ id: "e1", name: "Björk", type: "artist" }],
  status: "no-window",
  planningMode: "live",
  suggestions: [],
  ...over,
});

describe("restorePlan taste itinerary", () => {
  const withItinerary = (it: unknown) =>
    JSON.stringify({ days: [day("D-3")], tasteItinerary: it });

  test("a valid matching itinerary restores alongside the locked plan", () => {
    const res = restorePlan(withItinerary(itinerary()), tripRaw, route);
    expect(res).not.toBeNull();
    expect(res!.tasteItinerary).toEqual(itinerary());
    expect(res!.locked.size).toBe(1);
  });

  test("a valid ready itinerary for this trip restores", () => {
    const postDay = trip.days.find((d) => d.dayIndex > trip.departureDayIndex)!;
    const it = itinerary({
      status: "ready",
      suggestions: [
        {
          dayIndex: postDay.dayIndex,
          date: postDay.date,
          label: postDay.label,
          startMin: 840,
          endMin: 900,
          place: { name: "Kissa Tanto", categories: ["listening bar"] },
        },
      ],
    });
    const res = restorePlan(withItinerary(it), tripRaw, route);
    expect(res!.tasteItinerary).toEqual(it);
  });

  test("a mismatched or malformed itinerary is omitted — the plan still restores", () => {
    const cases = [
      itinerary({ destinationCode: "JFK" }),
      itinerary({ departureDate: "2026-05-11" }),
      itinerary({ status: "ready", suggestions: [] }),
      { ...itinerary(), suggestions: [{ dayIndex: 4, date: "x", label: "D+1", startMin: 1, endMin: 2, place: { name: "", categories: [] } }] },
      "not an itinerary",
      42,
    ];
    for (const it of cases) {
      const res = restorePlan(withItinerary(it), tripRaw, route);
      expect(res).not.toBeNull();
      expect(res!.tasteItinerary).toBeUndefined();
      expect(res!.locked.size).toBe(1);
    }
  });

  test("legacy saves without the field still restore", () => {
    const res = restorePlan(plan, tripRaw, route);
    expect(res).not.toBeNull();
    expect(res!.tasteItinerary).toBeUndefined();
  });
});
