import { describe, expect, test } from "bun:test";
import { firstUnansweredStep, hasPartialSetup, setupSummary } from "../src/domain/setup-state";

// Two rules the setup must never break:
//   1. it never silently loses an answer;
//   2. it never asks a question it already has an answer to.

describe("the setup's answers", () => {
  test("the first unanswered step is where the traveller left off", () => {
    expect(firstUnansweredStep({})).toBe(0);
    expect(firstUnansweredStep({ bedtimeMin: 1435, wakeMin: 405 })).toBe(1);
    expect(
      firstUnansweredStep({
        bedtimeMin: 1435,
        wakeMin: 405,
        protect: [],
      }),
    ).toBe(2);
    expect(
      firstUnansweredStep({
        bedtimeMin: 1435,
        wakeMin: 405,
        protect: [],
        wearableOptedIn: false,
      }),
    ).toBe(3);
    expect(
      firstUnansweredStep({
        bedtimeMin: 1435,
        wakeMin: 405,
        protect: [],
        wearableOptedIn: false,
        tone: "cheeky",
      }),
    ).toBe(4);
  });

  test("a partial save is worth resuming; a fresh one is not", () => {
    expect(hasPartialSetup(null)).toBe(false);
    expect(hasPartialSetup({})).toBe(false);
    expect(hasPartialSetup({ bedtimeMin: 1435, wakeMin: 405 })).toBe(true);
    // Everything answered: nothing to resume, the handoff is next.
    expect(
      hasPartialSetup({
        bedtimeMin: 1435,
        wakeMin: 405,
        protect: [],
        wearableOptedIn: false,
        tone: "cheeky",
      }),
    ).toBe(false);
  });

  test("the summary is one line of what they told us", () => {
    const line = setupSummary({
      bedtimeMin: 1435,
      wakeMin: 405,
      protect: ["a", "b"],
      wearableOptedIn: false,
      tone: "cheeky",
    });
    expect(line).toContain("23:55–06:45");
    expect(line).toContain("2 commitments");
    expect(line).toContain("what you tell us");
    expect(line).toContain("cheeky voice");
    expect(line.split(" · ").length).toBeLessThanOrEqual(4);
  });

  test("an empty answer says nothing, rather than something vague", () => {
    expect(setupSummary({})).toBe("");
  });
});
