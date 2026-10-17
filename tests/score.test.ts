import { describe, expect, test } from "bun:test";
import { PASS_SCORE } from "@/domain/types";
import { scoreBand } from "@/domain/score";

describe("scoreBand", () => {
  test("a score at or above the gate passes", () => {
    expect(scoreBand(1)).toBe("pass");
    expect(scoreBand(0.95)).toBe("pass");
    expect(scoreBand(PASS_SCORE)).toBe("pass");
  });

  test("a zero is a failure, not a neutral reading", () => {
    // The bug this exists for: /history painted every score the same green,
    // so three `0.00` runs read as healthy alongside the 0.95s.
    expect(scoreBand(0)).toBe("fail");
  });

  test("below the gate but above half of it warns", () => {
    expect(scoreBand(PASS_SCORE - 0.01)).toBe("warn");
    expect(scoreBand(PASS_SCORE / 2)).toBe("warn");
    expect(scoreBand(PASS_SCORE / 2 - 0.01)).toBe("fail");
  });

  test("a missing score fails closed rather than rendering as a pass", () => {
    expect(scoreBand(Number.NaN)).toBe("fail");
  });

  test("bands are derived from the gate, so they cannot drift from it", () => {
    // If PASS_SCORE moves, the bands move with it. This is the assertion that
    // keeps a second, hand-tuned threshold from creeping in beside the real one.
    expect(PASS_SCORE).toBe(0.75);
    expect(scoreBand(0.74)).not.toBe("pass");
    expect(scoreBand(0.76)).toBe("pass");
  });
});