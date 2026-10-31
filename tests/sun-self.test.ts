import { describe, expect, test } from "bun:test";
import {
  SUNSELF_RAY_COUNT,
  SUNSELF_SEVERE_DEBT_MIN,
  sunSelfMoodWord,
  sunSelfRead,
} from "@/domain/sun-self";

/* The sun-self is the brand's honesty test (round 23): a face computed from
 * the same numbers the passport stamps. These locks say the glyph can never
 * look better than the trip is. */

describe("sunSelfRead", () => {
  test("no shift to carry — home, and no division by zero", () => {
    const r = sunSelfRead({ owedMin: 0, deliveredMin: 0, requiredMin: 0, direction: "east" });
    expect(r.mood).toBe("adjusted");
    expect(r.glow).toBe(1);
    expect(r.lid).toBe(0);
    expect(r.raysLit).toBe(SUNSELF_RAY_COUNT);
  });

  test("the stakes state: full debt, nothing banked — drained, lids heavy", () => {
    const r = sunSelfRead({ owedMin: 540, deliveredMin: 0, requiredMin: 540, direction: "east" });
    expect(r.mood).toBe("drained");
    expect(r.glow).toBe(0);
    expect(r.lid).toBeCloseTo(0.85, 5); // as heavy as we ever draw, never shut
    expect(r.line).toContain("9.0h to carry");
  });

  test("debt beyond severe caps the lids — worse than 9h is not a sadder face", () => {
    const r = sunSelfRead({
      owedMin: SUNSELF_SEVERE_DEBT_MIN * 2,
      deliveredMin: 0,
      requiredMin: SUNSELF_SEVERE_DEBT_MIN * 2,
      direction: "east",
    });
    expect(r.lid).toBeLessThanOrEqual(0.85);
  });

  test("the honest payoff: half delivered means half-lit, never radiant", () => {
    const r = sunSelfRead({ owedMin: 270, deliveredMin: 270, requiredMin: 540, direction: "east" });
    expect(r.glow).toBe(0.5);
    expect(r.mood).toBe("lifting"); // exactly half: not yet "half-lit" (>= 0.6)
    expect(r.line).toContain("4.5h banked");
    expect(r.line).toContain("4.5h to go");
    const r2 = sunSelfRead({ owedMin: 216, deliveredMin: 324, requiredMin: 540, direction: "east" });
    expect(r2.mood).toBe("half-lit");
    expect(r2.line).toContain("still owed — honestly");
  });

  test("adjusted needs both: the debt down and the shift banked", () => {
    // Little owed but nothing delivered is NOT adjusted — it's waiting.
    const notYet = sunSelfRead({ owedMin: 30, deliveredMin: 0, requiredMin: 540, direction: "east" });
    expect(notYet.mood).not.toBe("adjusted");
    const home = sunSelfRead({ owedMin: 30, deliveredMin: 520, requiredMin: 540, direction: "east" });
    expect(home.mood).toBe("adjusted");
    expect(home.line).toBe("Body clock home.");
  });

  test("direction tilts the face; an adjusted face stands straight", () => {
    const east = sunSelfRead({ owedMin: 540, deliveredMin: 0, requiredMin: 540, direction: "east" });
    const west = sunSelfRead({ owedMin: 540, deliveredMin: 0, requiredMin: 540, direction: "west" });
    expect(east.tiltDeg).toBeGreaterThan(0);
    expect(west.tiltDeg).toBeLessThan(0);
    expect(east.tiltDeg).toBe(-west.tiltDeg);
    const home = sunSelfRead({ owedMin: 0, deliveredMin: 540, requiredMin: 540, direction: "east" });
    expect(home.tiltDeg).toBe(0);
  });

  test("rays: locked days light them when a run carries them, glow otherwise", () => {
    const locked = sunSelfRead({
      owedMin: 480,
      deliveredMin: 60,
      requiredMin: 540,
      direction: "east",
      daysLocked: 4,
    });
    expect(locked.raysLit).toBe(4);
    const derived = sunSelfRead({ owedMin: 270, deliveredMin: 270, requiredMin: 540, direction: "east" });
    expect(derived.raysLit).toBe(6); // glow * 12, rounded
  });

  test("delivered can never outshine required", () => {
    const r = sunSelfRead({ owedMin: 0, deliveredMin: 900, requiredMin: 540, direction: "east" });
    expect(r.glow).toBeLessThanOrEqual(1);
  });

  test("mood words stay traveller-facing", () => {
    expect(sunSelfMoodWord("drained")).toBe("drained");
    expect(sunSelfMoodWord("waiting")).toBe("warming up");
    expect(sunSelfMoodWord("half-lit")).toBe("half-lit");
  });
});
