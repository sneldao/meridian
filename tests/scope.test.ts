import { describe, expect, test } from "bun:test";
import {
  ScopeGuard,
  isOutOfScope,
  makesClinicalClaim,
  prescribesDose,
  scrub,
  unsafeSpans,
} from "../src/domain/scope";

describe("scope guard", () => {
  test("dose language is out of scope, timing language is not", () => {
    expect(prescribesDose("take 3 mg melatonin an hour before bed")).toBe(true);
    expect(prescribesDose("melatonin at 21:00, before the wind-down")).toBe(false);
  });

  test("clinical claims are out of scope", () => {
    expect(makesClinicalClaim("this cures jet lag")).toBe(true);
    expect(makesClinicalClaim("timed light advances the clock")).toBe(false);
  });

  test("scrub redacts the span and keeps the surrounding sentence", () => {
    const out = scrub("Light at 07:00, and take 0.5 mg melatonin at 21:00 before bed.");
    expect(out).not.toContain("0.5 mg");
    expect(out).toContain("Light at 07:00");
    expect(out).toContain("before bed");
  });

  test("clean text passes through untouched", () => {
    const clean = "Morning light anchors the advance. Cut caffeine by 13:00.";
    expect(scrub(clean)).toBe(clean);
    expect(isOutOfScope(clean)).toBe(false);
  });

  test("spans do not leak state between calls (no lastIndex bug)", () => {
    const text = "take 5 mg, then take 5 mg";
    expect(unsafeSpans(text)).toHaveLength(2);
    expect(unsafeSpans(text)).toHaveLength(2);
  });

  describe("streaming", () => {
    test("a pattern split across deltas is still redacted", () => {
      const guard = new ScopeGuard(16);
      const deltas = ["Light at 07:00. Take ", "3 mg mel", "atonin at 21:00."];
      const shown = deltas.map((d) => guard.push(d)).join("") + guard.flush();
      expect(shown).not.toContain("3 mg");
      expect(shown).toContain("Light at 07:00");
    });

    test("a span straddling the cut is not emitted in the clear", () => {
      const guard = new ScopeGuard(24);
      let shown = guard.push("Plan set. I would take 3 mg melatonin before bed, then lights out.");
      shown += guard.flush();
      expect(shown).not.toContain("3 mg");
    });

    test("clean narration streams verbatim", () => {
      const guard = new ScopeGuard(8);
      const deltas = ["Morning ", "light ", "anchors ", "the ", "advance."];
      const shown = deltas.map((d) => guard.push(d)).join("") + guard.flush();
      expect(shown).toBe("Morning light anchors the advance.");
    });

    test("nothing is emitted before the tail has accumulated", () => {
      const guard = new ScopeGuard(32);
      expect(guard.push("short")).toBe("");
    });
  });
});
