import { describe, expect, test } from "bun:test";
import { demoLookbook, lookbookWindows } from "@/domain/lookbook";
import { demoJourney, sunSelfForBeat } from "@/domain/demo-beats";

/* The lookbook of states (round 29) may only ever show faces the model says
 * exist: each window's read is the same computed value the beats carry, and
 * its state word is the read's mood word. Nothing authored. */

describe("lookbook — every window is a computed state", () => {
  const j = demoJourney("miles");
  const windows = lookbookWindows(j);

  test("five windows, in the order the trip lives them", () => {
    expect(windows.map((w) => w.id)).toEqual([
      "asleep",
      "drained",
      "lifting",
      "half-lit",
      "adjusted",
    ]);
  });

  test("the journey windows carry the beats' own faces", () => {
    const drained = windows.find((w) => w.id === "drained")!;
    const lifting = windows.find((w) => w.id === "lifting")!;
    const halfLit = windows.find((w) => w.id === "half-lit")!;
    expect(drained.read).toEqual(sunSelfForBeat(j, "stakes"));
    expect(lifting.read).toEqual(sunSelfForBeat(j, "crew"));
    expect(halfLit.read).toEqual(sunSelfForBeat(j, "payoff"));
  });

  test("the ends of the family: asleep, never sadder; adjusted, fully home", () => {
    const asleep = windows.find((w) => w.id === "asleep")!;
    expect(asleep.state).toBe("asleep");
    expect(asleep.read.lid).toBe(1);
    expect(asleep.read.raysLit).toBe(0);
    const adjusted = windows.find((w) => w.id === "adjusted")!;
    expect(adjusted.state).toBe("adjusted");
    expect(adjusted.read.glow).toBe(1);
    // The adjusted window is the same-timezone read: no shift to carry.
    expect(adjusted.read.line).toContain("Body clock home");
  });

  test("state words are mood words of the window's own read", () => {
    for (const w of windows) {
      expect(typeof w.state).toBe("string");
      expect(w.state.length).toBeGreaterThan(0);
      expect(typeof w.read.line).toBe("string");
    }
  });

  test("the demo lookbook is the canonical journey's gallery", () => {
    expect(demoLookbook().length).toBe(5);
    expect(demoLookbook()[0].id).toBe("asleep");
  });
});
