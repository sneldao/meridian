import { describe, expect, test } from "bun:test";
import { applyFlightChoice, buildTrip, calendarFor, neutralCalendarFor } from "../src/domain/fixtures";
import { flightWindowFor, getFlightRecommendations } from "../src/domain/nudges";
import type { CalendarEvent } from "../src/domain/types";

const eastTrip = buildTrip("LHR", "HND", "2026-10-20");
const westTrip = buildTrip("LHR", "JFK", "2026-10-20");

describe("flightWindowFor", () => {
  test("every advertised option resolves to a real window", () => {
    for (const rec of getFlightRecommendations(eastTrip)) {
      expect(flightWindowFor(eastTrip, rec.id)).not.toBeNull();
    }
  });

  test("a west id on an eastbound trip resolves to null, not the wrong window", () => {
    expect(flightWindowFor(eastTrip, "afternoon-west")).toBeNull();
    expect(flightWindowFor(westTrip, "afternoon-west")).toEqual({ departMin: 870, arriveMin: 1060 });
  });

  test("missing or unknown ids resolve to null", () => {
    expect(flightWindowFor(eastTrip, null)).toBeNull();
    expect(flightWindowFor(eastTrip, "not-a-flight")).toBeNull();
  });
});

describe("applyFlightChoice", () => {
  test("moves the flight event and keeps its duration", () => {
    const events = calendarFor(eastTrip);
    const before = events.find((e) => e.id === "ev-flight")!;
    const moved = applyFlightChoice(events, 19 * 60 + 15).find((e) => e.id === "ev-flight")!;
    expect(moved.startMin).toBe(19 * 60 + 15);
    expect(moved.endMin - moved.startMin).toBe(before.endMin - before.startMin);
    // nothing else moved
    expect(applyFlightChoice(events, 1155).filter((e) => e.id !== "ev-flight")).toEqual(
      events.filter((e) => e.id !== "ev-flight"),
    );
  });

  test("the neutral (non-demo) calendar's flight moves too", () => {
    const moved = applyFlightChoice(neutralCalendarFor(eastTrip), 19 * 60 + 15).find((e) => e.id === "n-flight");
    expect(moved?.startMin).toBe(19 * 60 + 15);
  });

  // The regression that mattered: on a connected Google calendar the flight has
  // a hash id and a carrier title, so the original id-only check matched nothing
  // and the picker silently did nothing while the API still echoed the id back
  // as valid. This is the shape that actually comes back in production.
  test("a Google-shaped flight (hash id, carrier title) still moves", () => {
    const googleish: CalendarEvent[] = [
      { id: "a8a5p1u6grkhgk7t8376t6i208", title: "Team standup", dayIndex: 0, startMin: 420, endMin: 450, movable: true },
      { id: "t0ur6lg3h9ppjtnmc0ad765bbo", title: "BA005 LHR → HND", dayIndex: 0, startMin: 680, endMin: 710, movable: false },
    ];
    const moved = applyFlightChoice(googleish, 19 * 60 + 15);
    const flight = moved.find((e) => e.title.includes("LHR"))!;
    expect(flight.startMin).toBe(19 * 60 + 15);
    expect(flight.endMin - flight.startMin).toBe(30);
    expect(moved.find((e) => e.title === "Team standup")).toEqual(googleish[0]);
  });

  test("a flight titled without a route pair is still recognised", () => {
    const loose: CalendarEvent[] = [
      { id: "xyz", title: "Flight to Tokyo", dayIndex: 0, startMin: 600, endMin: 660, movable: false },
    ];
    expect(applyFlightChoice(loose, 870)[0]!.startMin).toBe(870);
  });

  test("a calendar with no flight is returned untouched", () => {
    const none: CalendarEvent[] = [
      { id: "a", title: "Team standup", dayIndex: 0, startMin: 420, endMin: 450, movable: true },
      { id: "b", title: "Gym", dayIndex: 0, startMin: 1020, endMin: 1080, movable: true },
    ];
    expect(applyFlightChoice(none, 870)).toEqual(none);
  });
});
