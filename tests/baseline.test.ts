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

describe("a self-reported wake band stays a coherent profile", () => {
  // The tests above assert the wake time and chronotype but never the bedtime,
  // which is how a 24-hour sign error lived here: bedtime was computed as
  // `wake + sleep - 1440`, putting a 06:45 waker to bed at 13:35. Nothing
  // crashed, every band produced a baseline, and the symptom only appeared in
  // the solver — whose plans silently became unplaceable.

  const sleepMin = GARMIN_BASELINE.avgSleepMin;

  test("the fixture itself is internally consistent", () => {
    // The invariant every derived profile must also satisfy.
    const bed = ((GARMIN_BASELINE.avgWakeMin - sleepMin) % 1440 + 1440) % 1440;
    expect(bed).toBe(GARMIN_BASELINE.avgBedtimeMin);
  });

  test("bedtime is wake minus sleep, so the night straddles midnight", () => {
    for (const band of ["before6", "6to8", "after8"] as const) {
      const { baseline } = resolveBaselineState(band);
      const expected = ((baseline.avgWakeMin - sleepMin) % 1440 + 1440) % 1440;
      expect(baseline.avgBedtimeMin).toBe(expected);
      // Sleep duration is preserved exactly — the band moves the window, it
      // does not quietly make the traveller sleep longer or shorter.
      const span =
        (baseline.avgWakeMin - baseline.avgBedtimeMin + 1440) % 1440;
      expect(span).toBe(sleepMin);
    }
  });

  test("bedtime never lands in the daytime, whatever the band", () => {
    // The signature of the old bug: every band put bedtime in the small hours
    // of the *afternoon*. A real bedtime is late evening or — for a late
    // riser with a short night — just after midnight, never between 06:00 and
    // 17:00.
    for (const band of ["before6", "6to8", "after8"] as const) {
      const { baseline } = resolveBaselineState(band);
      const bed = baseline.avgBedtimeMin;
      expect(bed < 6 * 60 || bed > 17 * 60).toBe(true);
    }
  });

  test("a mid-range answer reproduces the fixture's own times", () => {
    // `6to8` anchors at 06:45, the same wake as the fixture, so bedtime must
    // land on the fixture's 23:55 — a direct check on the sign.
    const { baseline } = resolveBaselineState("6to8");
    expect(baseline.avgWakeMin).toBe(GARMIN_BASELINE.avgWakeMin);
    expect(baseline.avgBedtimeMin).toBe(GARMIN_BASELINE.avgBedtimeMin);
  });

  test("a late answer moves bedtime past midnight, wrapping forward", () => {
    // 08:00 minus a 410-minute night is 01:10, not 14:50.
    const { baseline } = resolveBaselineState("after8");
    expect(baseline.avgBedtimeMin).toBe(70);
  });
});
