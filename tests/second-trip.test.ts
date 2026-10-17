import { describe, expect, test } from "bun:test";
import { secondTripCopy, secondTripProof, type SecondTripRun } from "../src/domain/second-trip";

// Round 4, B3 — second-trip memory proof. The Traveller tier's retention
// claim has to be a visible line on the home surface, not just a sentence
// in copy. The contract: pure secondTripProof(runs, currentRoute) returns
// the most recent prior trip on a different route, or null.

const route = (origin: string, destination: string, required = 8 * 60, direction: "east" | "west" = "east") => ({
  origin: { code: origin },
  destination: { code: destination },
  requiredShiftMin: required,
  direction,
});

const run = (
  origin: string,
  destination: string,
  score: number,
  savedAt = "2026-09-12T08:00:00Z",
  direction: "east" | "west" = "east",
): SecondTripRun => ({
  savedAt,
  trip: { ...route(origin, destination, 8 * 60, direction) },
  score,
});

describe("secondTripProof (round 4 B3)", () => {
  test("returns null with no runs", () => {
    expect(secondTripProof([], { origin: "LHR", destination: "HND" })).toBeNull();
  });

  test("returns null when only the current route exists in history", () => {
    // One trip on file, and it is the route the traveller is on now. No
    // prior journey — the proof reads "first trip" until the next one.
    const out = secondTripProof(
      [run("LHR", "HND", 0.92)],
      { origin: "LHR", destination: "HND" },
    );
    expect(out).toBeNull();
  });

  test("returns the prior trip when the current route differs", () => {
    const out = secondTripProof(
      [run("JFK", "SFO", 0.88, "2026-08-04T09:00:00Z", "west")],
      { origin: "LHR", destination: "HND" },
    );
    expect(out).not.toBeNull();
    expect(out!.route).toEqual({ origin: "JFK", destination: "SFO" });
    expect(out!.score).toBe(0.88);
    expect(out!.direction).toBe("west");
    expect(out!.shiftHours).toBe(8);
    expect(out!.savedAt).toBe("2026-08-04T09:00:00Z");
  });

  test("same-route rows are skipped — they are the current trip re-opened", () => {
    const out = secondTripProof(
      [
        run("LHR", "HND", 0.95, "2026-10-12T08:00:00Z"),
        run("JFK", "SFO", 0.88, "2026-08-04T09:00:00Z", "west"),
      ],
      { origin: "LHR", destination: "HND" },
    );
    expect(out).not.toBeNull();
    expect(out!.route.origin).toBe("JFK");
  });

  test("returns the most recent prior trip when there are several", () => {
    const out = secondTripProof(
      [
        run("SFO", "SIN", 0.91, "2026-10-01T08:00:00Z", "west"),
        run("JFK", "SFO", 0.88, "2026-08-04T09:00:00Z", "west"),
        run("CDG", "JFK", 0.82, "2026-06-12T08:00:00Z", "west"),
      ],
      { origin: "LHR", destination: "HND" },
    );
    expect(out!.route).toEqual({ origin: "SFO", destination: "SIN" });
  });

  test("corrupt rows are skipped, not used to fabricate a proof", () => {
    const out = secondTripProof(
      [
        // No trip field at all
        { savedAt: "2026-09-01T00:00:00Z", score: 0.5 } as SecondTripRun,
        run("JFK", "SFO", 0.88, "2026-08-04T09:00:00Z", "west"),
      ],
      { origin: "LHR", destination: "HND" },
    );
    expect(out).not.toBeNull();
    expect(out!.route.origin).toBe("JFK");
  });

  test("round-trips: a proof fed back through currentRoute returns null", () => {
    const out = secondTripProof(
      [run("JFK", "SFO", 0.88, "2026-08-04T09:00:00Z", "west")],
      { origin: "JFK", destination: "SFO" },
    );
    expect(out).toBeNull();
  });
});

describe("secondTripCopy (round 4 B3)", () => {
  test("names the route and scores the prior trip", () => {
    const copy = secondTripCopy({
      route: { origin: "JFK", destination: "SFO" },
      shiftHours: 8,
      direction: "west",
      score: 0.88,
      savedAt: "2026-08-04T09:00:00Z",
    });
    expect(copy).toContain("JFK → SFO");
    expect(copy).toContain("8h west");
    expect(copy).toContain("0.88");
  });

  test("falls back to 'your last trip' when the savedAt is unparseable", () => {
    const copy = secondTripCopy({
      route: { origin: "JFK", destination: "SFO" },
      shiftHours: 8,
      direction: "west",
      score: 0.88,
      savedAt: "not a date",
    });
    expect(copy).toContain("your last trip");
  });
});
