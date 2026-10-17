import { describe, expect, test } from "bun:test";
import { GARMIN_BASELINE, resolveBaselineState } from "../src/domain/fixtures";

describe("resolveBaselineState", () => {
  test("fixture source with no wake answer is honestly demo-default", () => {
    const { baseline, kind } = resolveBaselineState(null);
    expect(kind).toBe("demo-default");
    expect(baseline).toBe(GARMIN_BASELINE); // same object — nothing fabricated
  });

  test("a wake answer over the fixture is a derived profile, not a wearable's", () => {
    const { baseline, kind } = resolveBaselineState("before6");
    expect(kind).toBe("wake-band");
    expect(baseline.avgWakeMin).toBe(5 * 60 + 45);
    expect(baseline.chronotype).toBe("early");
    expect(baseline.source).toContain("self-report");
  });

  test("garmin source stays garmin even when the wake question refines it", () => {
    const { baseline, kind } = resolveBaselineState("after8", GARMIN_BASELINE, "garmin");
    expect(kind).toBe("garmin");
    expect(baseline.avgWakeMin).toBe(8 * 60);
  });

  test("an invalid band is no answer — demo-default, not a crash", () => {
    // @ts-expect-error — runtime callers can hand us anything from a query param
    const { kind } = resolveBaselineState("sometime");
    expect(kind).toBe("demo-default");
  });
});
