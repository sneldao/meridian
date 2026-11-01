import { describe, expect, test } from "bun:test";
import { stepReceipt } from "@/domain/receipts";
import { interventionSupports } from "@/domain/circadian";
import type { DayPlan } from "@/domain/types";

/* Step receipts (round 26): the PRC model gates, the share numbers. These
 * tests lock that a done step is never credited with minutes it didn't
 * earn — and never scolded when it earned none. */

// A day advancing 60 min (eastbound): wake 07:00 → CBTmin 05:00.
//  · light 06:00–06:30 lands in the advance zone (aligned)
//  · light 01:00–01:30 lands in the delay zone (opposing)
//  · light 15:00 sits in the dead zone (inert)
//  · a sleep window carries the anchor share
const day: DayPlan = {
  dayIndex: 1,
  label: "Day 1",
  shiftMin: -60,
  targetWakeMin: 420,
  targetBedtimeMin: 1320,
  interventions: [
    { kind: "light_exposure", startMin: 360, endMin: 390, note: "morning light" },
    { kind: "light_exposure", startMin: 60, endMin: 90, note: "too-early light" },
    { kind: "light_exposure", startMin: 900, endMin: 930, note: "midday light" },
    { kind: "sleep_window", startMin: 1320, endMin: 420, note: "sleep anchor" },
  ],
};

describe("stepReceipt", () => {
  test("the fixture zones land where the model says", () => {
    const s = interventionSupports(day);
    expect(s.find((x) => x.startMin === 360)?.support).toBeLessThan(0); // advance
    expect(s.find((x) => x.startMin === 60)?.support).toBeGreaterThan(0); // delay
    expect(s.find((x) => x.startMin === 900)?.support).toBe(0); // dead zone
  });

  test("an aligned step banks its share of the day", () => {
    const r = stepReceipt({ plan: day, category: "sunlight", kind: "light_exposure", startMin: 360 });
    expect(r.minutes).toBeGreaterThan(0);
    expect(r.minutes).toBeLessThanOrEqual(Math.abs(day.shiftMin));
    expect(r.text).toContain("banked");
    expect(r.text).toContain(`the day's ${Math.abs(day.shiftMin)} min`);
  });

  test("an opposing step is logged, never credited, never scolded", () => {
    const r = stepReceipt({ plan: day, category: "sunlight", kind: "light_exposure", startMin: 60 });
    expect(r.minutes).toBe(0);
    expect(r.text).toBe("logged");
  });

  test("dead-zone light is logged warmly — present but inert", () => {
    const r = stepReceipt({ plan: day, category: "sunlight", kind: "light_exposure", startMin: 900 });
    expect(r.minutes).toBe(0);
    expect(r.text).toContain("dead-zone");
    expect(r.text).toContain("anchors");
  });

  test("kinds the model doesn't quantify pass the gate and keep their share", () => {
    const r = stepReceipt({ plan: day, category: "sleep", kind: "sleep_window", startMin: 1320 });
    expect(r.minutes).toBeGreaterThan(0);
    expect(r.text).toContain("banked");
  });

  test("a hold day says what it does instead of zero", () => {
    const hold: DayPlan = { ...day, shiftMin: 0 };
    const r = stepReceipt({ plan: hold, category: "sunlight", kind: "light_exposure", startMin: 360 });
    expect(r.minutes).toBe(0);
    expect(r.dayShiftMin).toBe(0);
    expect(r.text).toContain("steady");
  });

  test("receipts never outshine the day: shares stay inside the shift", () => {
    for (const iv of day.interventions) {
      const category = iv.kind === "sleep_window" ? "sleep" : "sunlight";
      const r = stepReceipt({ plan: day, category, kind: iv.kind, startMin: iv.startMin });
      expect(r.minutes).toBeLessThanOrEqual(Math.abs(day.shiftMin));
    }
  });
});
