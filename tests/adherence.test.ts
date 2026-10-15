import { describe, expect, test } from "bun:test";
import { foldCheckIns, parseCheckInText } from "../src/domain/adherence";
import { ADHERENCE_PROFILE } from "../src/domain/fixtures";

describe("adherence", () => {
  test("parseCheckInText detects a skip", () => {
    const ci = parseCheckInText({ text: "skipped the 6am light" });
    expect(ci.status).toBe("skipped");
    expect(ci.kind).toBe("light_exposure");
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