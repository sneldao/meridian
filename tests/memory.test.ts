import { describe, expect, test } from "bun:test";
import { crossTripBrief, memoryBrief, memoryBriefWithCrossTrip } from "../src/domain/memory";
import type { CrewMemory } from "../src/domain/types";

// memoryBrief's existing behaviour is covered by the analyst prompt path;
// these pin the cross-trip extension: a prior different-route trip adds one
// honest line, anything else adds nothing.

const memWithRuns = (labels: string[]): CrewMemory => ({
  runs: labels.map((tripLabel, i) => ({
    at: 1700000000000 + i * 1000,
    tripLabel,
    lockedDays: 5,
    meanScore: 0.88,
  })),
  checkIns: [],
  learned: { skippedKinds: [], notes: [] },
});

const EMPTY: CrewMemory = {
  runs: [],
  checkIns: [],
  learned: { skippedKinds: [], notes: [] },
};

describe("crossTripBrief", () => {
  test("returns null with no runs — first shift carries no cross-trip claim", () => {
    expect(crossTripBrief(EMPTY, { origin: "LHR", destination: "HND" })).toBeNull();
  });

  test("returns null when only the current route exists in history", () => {
    const mem = memWithRuns(["LHR→HND"]);
    expect(crossTripBrief(mem, { origin: "LHR", destination: "HND" })).toBeNull();
  });

  test("names the most recent prior trip on a different route", () => {
    const mem = memWithRuns(["JFK→SFO", "LHR→HND"]);
    const out = crossTripBrief(mem, { origin: "LHR", destination: "HND" });
    expect(out).not.toBeNull();
    expect(out!).toContain("JFK→SFO");
    expect(out!).toContain("Cross-trip");
  });

  test("skips malformed labels instead of fabricating", () => {
    const mem = memWithRuns(["no-arrow-here", "JFK→SFO"]);
    const out = crossTripBrief(mem, { origin: "LHR", destination: "HND" });
    expect(out).toContain("JFK→SFO");
  });
});

describe("memoryBriefWithCrossTrip", () => {
  test("with no prior different-route trip the output is exactly memoryBrief", () => {
    const mem = memWithRuns(["LHR→HND"]);
    expect(memoryBriefWithCrossTrip(mem, { origin: "LHR", destination: "HND" })).toBe(
      memoryBrief(mem),
    );
  });

  test("with a prior trip it appends the cross-trip line", () => {
    const mem = memWithRuns(["JFK→SFO"]);
    const out = memoryBriefWithCrossTrip(mem, { origin: "LHR", destination: "HND" });
    expect(out.startsWith(memoryBrief(mem))).toBe(true);
    expect(out).toContain("JFK→SFO");
  });
});
