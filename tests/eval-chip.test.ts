import { describe, expect, test } from "bun:test";
import { evalChipLabel, evalChipTitle } from "../src/components/ui/eval-chip";

// The scorer chip is the one place a verdict is shown. These assertions exist
// because the two states used to render byte-identical text and differ only in
// hue — so "did this day's plan pass the gate?" was unanswerable without
// colour vision, and unanswerable in the DOM. Evidence only appears after a
// real crew run (never pre-run), so this cannot be caught by rendering the
// screen on a machine whose provider is failing; it has to be pinned here.

describe("evalChipLabel", () => {
  test("pass and fail never render the same text", () => {
    // Same score on purpose: the score alone must not be able to carry the
    // verdict, because a fail can score perfectly and a pass can score poorly.
    const pass = evalChipLabel(0.9, []);
    const fail = evalChipLabel(0.9, ["SHIFT_OVERSTATED"]);
    expect(pass).not.toBe(fail);
  });

  test("a pass reads as a pass, with no issue count", () => {
    expect(evalChipLabel(0.92, [])).toBe("✓ check 0.92");
  });

  test("a fail reads as a fail and counts the issues", () => {
    expect(evalChipLabel(0.62, ["SHIFT_OVERSTATED"])).toBe("✗ check 0.62 · 1 issue");
    expect(evalChipLabel(0.4, ["SHIFT_OVERSTATED", "CIRCADIAN_CONFLICT"])).toBe(
      "✗ check 0.40 · 2 issues",
    );
  });

  test("the two states carry different glyphs, not just different words", () => {
    // The glyph is what survives greyscale, low vision and forced-colours mode.
    expect(evalChipLabel(1, [])[0]).not.toBe(evalChipLabel(0, ["X"])[0]);
    expect(evalChipLabel(1, [])[0]).toBe("✓");
    expect(evalChipLabel(0, ["X"])[0]).toBe("✗");
  });

  test("both states keep the score, so the numbers still line up visually", () => {
    expect(evalChipLabel(0.87, [])).toContain("0.87");
    expect(evalChipLabel(0.87, ["X"])).toContain("0.87");
  });
});

describe("evalChipTitle", () => {
  test("a pass says so", () => {
    expect(evalChipTitle([])).toBe("Passed the deterministic gate");
  });

  test("a fail names the violations, so the reason is not colour-only", () => {
    expect(evalChipTitle(["SHIFT_OVERSTATED"])).toContain("SHIFT_OVERSTATED");
    expect(evalChipTitle(["A", "B"])).toContain("A, B");
  });
});