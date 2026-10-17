import { describe, expect, test } from "bun:test";
import { applyFlightChoice, buildTrip, calendarFor, neutralCalendarFor } from "../src/domain/fixtures";
import { flightWindowFor, getFlightRecommendations } from "../src/domain/nudges";

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
});
