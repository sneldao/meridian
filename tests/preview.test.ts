import { describe, expect, test } from "bun:test";
import { displayBiometrics, isPreview, tapBecomesCheckIn, wakeAck } from "../src/domain/preview";
import { GARMIN_BASELINE } from "../src/domain/fixtures";

// Item 11 — the gate lives in the contract, not in the component, so the
// promise "preview is not a promise" is asserted in one place. If a renderer
// ever needs to know whether taps are durable, it asks this — not whether it
// happens to be in a sample-data state machine.

describe("isPreview (item 11)", () => {
  test("garmin source is never preview — numbers are real", () => {
    expect(isPreview("garmin", null)).toBe(false);
    expect(isPreview("garmin", "6to8")).toBe(false);
  });

  test("wake-band source is never preview — the question is answered", () => {
    expect(isPreview("wake-band", null)).toBe(false);
    expect(isPreview("wake-band", "after8")).toBe(false);
  });

  test("demo-default without a wake answer stays preview", () => {
    expect(isPreview("demo-default", null)).toBe(true);
    expect(isPreview("demo-default", undefined)).toBe(true);
  });

  test("demo-default with a wake answer is not preview — the numbers are derived from you", () => {
    expect(isPreview("demo-default", "before6")).toBe(false);
    expect(isPreview("demo-default", "6to8")).toBe(false);
    expect(isPreview("demo-default", "after8")).toBe(false);
  });

  test("an unknown kind previews rather than assuming measured", () => {
    // /api/trip hasn't been hit yet — the renderer must not show fixture
    // numbers as if they came from a wearable.
    expect(isPreview(undefined, null)).toBe(true);
    expect(isPreview(null, null)).toBe(true);
  });
});

// Item 12 — "no invented biometrics". The contract is the rule the renderer
// asks; if a `Default` came from the sample persona, every measured cell is
// null, and absent reads "—".

describe("displayBiometrics (item 12)", () => {
  test("demo-default without a wake answer returns all null cells", () => {
    const out = displayBiometrics({
      baselineKind: "demo-default",
      wakeBand: null,
      baseline: GARMIN_BASELINE,
    });
    expect(out).toEqual({ sleep: null, hrv: null, restingHr: null });
  });

  test("an unknown kind (nothing fetched) is also all-null", () => {
    expect(
      displayBiometrics({ baselineKind: undefined, wakeBand: null, baseline: GARMIN_BASELINE }),
    ).toEqual({ sleep: null, hrv: null, restingHr: null });
  });

  test("wake-band sources render the fixture numbers — they are derived from you", () => {
    const out = displayBiometrics({
      baselineKind: "wake-band",
      wakeBand: "6to8",
      baseline: GARMIN_BASELINE,
    });
    expect(out.hrv).toBe("48 ms");
    expect(out.restingHr).toBe("58 bpm");
    expect(out.sleep).toBe("23:55–06:45");
  });

  test("garmin sources render the real wearable numbers", () => {
    const out = displayBiometrics({
      baselineKind: "garmin",
      wakeBand: null,
      baseline: GARMIN_BASELINE,
    });
    expect(out.hrv).toBe("48 ms");
    expect(out.restingHr).toBe("58 bpm");
    expect(out.sleep).toBe("23:55–06:45");
  });

  test("a missing baseline is treated as preview even when the kind says real", () => {
    // The kind promise without the underlying number is the dangerous case:
    // a renderer reading kind="garmin" must still see "—" rather than a
    // fabricated 48 ms.
    const out = displayBiometrics({ baselineKind: "garmin", wakeBand: null });
    expect(out).toEqual({ sleep: null, hrv: null, restingHr: null });
  });
});

// Item 11 follow-through: the *write* rule, not just the *display* rule. A
// preview tap is a dry run — it must never queue a `PendingMark`, never write
// `meridian:pendingCheckins:*`, never become a `CheckIn` at check-in time.
// The plan's DoD says "preview writes zero CheckIns asserted, not eyeballed";
// this is the assertion.

describe("tapBecomesCheckIn (item 11 follow-through)", () => {
  test("preview taps never queue a check-in", () => {
    expect(tapBecomesCheckIn("demo-default", null)).toBe(false);
    expect(tapBecomesCheckIn("demo-default", undefined)).toBe(false);
    expect(tapBecomesCheckIn(undefined, null)).toBe(false);
    expect(tapBecomesCheckIn(null, null)).toBe(false);
  });

  test("real-source taps always queue", () => {
    expect(tapBecomesCheckIn("garmin", null)).toBe(true);
    expect(tapBecomesCheckIn("wake-band", null)).toBe(true);
    expect(tapBecomesCheckIn("demo-default", "6to8")).toBe(true);
    expect(tapBecomesCheckIn("demo-default", "after8")).toBe(true);
  });

  test("the read rule and the write rule agree by construction", () => {
    // If these drift, a renderer would think one thing and write another.
    // The matrix is small enough to enumerate — every cell, both columns.
    const cases: [Parameters<typeof isPreview>[0], unknown][] = [
      ["demo-default", null],
      ["demo-default", undefined],
      ["demo-default", "before6"],
      ["demo-default", "6to8"],
      ["demo-default", "after8"],
      ["wake-band", null],
      ["garmin", null],
      [undefined, null],
      [null, "6to8"],
    ];
    for (const [k, w] of cases) {
      expect(tapBecomesCheckIn(k, w)).toBe(!isPreview(k, w));
    }
  });
});

// Round 4, B1 — the wake answer lands silently today; the acknowledgement
// names the re-plan so the traveller learns the answer mattered. One line,
// contract-owned copy, null when no answer is in play.

describe("wakeAck (round 4 B1)", () => {
  test("demo-default with each band acknowledges the re-plan", () => {
    expect(wakeAck("demo-default", "6to8")).toBe(
      "Re-planned around your mornings (6–8) — the plan below is yours now.",
    );
    expect(wakeAck("demo-default", "before6")).toContain("before 6");
    expect(wakeAck("demo-default", "after8")).toContain("after 8");
  });

  test("wake-band kind with a band acknowledges too — same answer, same line", () => {
    expect(wakeAck("wake-band", "6to8")).toBe(wakeAck("demo-default", "6to8"));
  });

  test("garmin needs no acknowledgement — the numbers were already theirs", () => {
    expect(wakeAck("garmin", "6to8")).toBeNull();
    expect(wakeAck("garmin", null)).toBeNull();
  });

  test("no answer means no acknowledgement — never invent one", () => {
    expect(wakeAck("demo-default", null)).toBeNull();
    expect(wakeAck("demo-default", undefined)).toBeNull();
    expect(wakeAck(undefined, null)).toBeNull();
    expect(wakeAck(null, "6to8")).toBeNull();
  });
});
