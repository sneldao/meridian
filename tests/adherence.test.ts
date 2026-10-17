import { describe, expect, test } from "bun:test";
import { foldCheckIns, parseCheckInText } from "../src/domain/adherence";
import { ADHERENCE_PROFILE } from "../src/domain/fixtures";

describe("adherence", () => {
  test("parseCheckInText detects a skip", () => {
    const ci = parseCheckInText({ text: "skipped the 6am light" });
    expect(ci.status).toBe("skipped");
    expect(ci.kind).toBe("light_exposure");
  });

  test("parseCheckInText keeps a caller-supplied startMin", () => {
    // Structured marks from the feed carry the placed ask's start — text
    // parsing stays the fallback for free text.
    const ci = parseCheckInText({
      dayIndex: 1,
      kind: "light_exposure",
      startMin: 330,
      status: "skipped",
      text: "skipped: Get outside light",
    });
    expect(ci.startMin).toBe(330);
    expect(ci.kind).toBe("light_exposure");
    expect(ci.dayIndex).toBe(1);
  });

  test("foldCheckIns moves the floor after early skips", () => {
    const ci = parseCheckInText({ text: "skipped the 5am light" });
    // force the pinned start
    ci.startMin = 5 * 60;
    ci.status = "skipped";
    const out = foldCheckIns(ADHERENCE_PROFILE, [ci]);
    expect(out.ignoresInterventionsBeforeMin).toBeGreaterThanOrEqual(5 * 60);
  });
});