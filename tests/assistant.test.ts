import { describe, expect, test } from "bun:test";
import { nextStepFromPlan } from "@/lib/assistant";
import type { DayPlan, Trip } from "@/domain/types";

const TRIP: Trip = {
  origin: { code: "LHR", name: "London", utcOffsetMin: 0 },
  destination: { code: "HND", name: "Tokyo", utcOffsetMin: 540 },
  direction: "east",
  requiredShiftMin: 480,
  departureDayIndex: 2,
  days: [
    { dayIndex: 0, label: "D-2", date: "2026-10-19" },
    { dayIndex: 1, label: "D-1", date: "2026-10-20" },
    { dayIndex: 2, label: "D0", date: "2026-10-21" },
    { dayIndex: 3, label: "D+1", date: "2026-10-22" },
  ],
} as Trip;

function iv(kind: string, startMin: number, endMin?: number, note = "note") {
  return { kind, startMin, endMin, note } as DayPlan["interventions"][number];
}

function days(...specs: [number, string, ReturnType<typeof iv>[]][]): DayPlan[] {
  return specs.map(([dayIndex, label, interventions]) => ({
    dayIndex,
    label,
    shiftMin: 30,
    targetBedtimeMin: 1320,
    targetWakeMin: 420,
    interventions,
  }));
}

describe("nextStepFromPlan", () => {
  test("picks the earliest step still ahead", () => {
    const feed = {
      trip: TRIP,
      days: days([1, "D-1", [iv("light_exposure", 480), iv("sleep_window", 1320)]]),
    };
    // 2026-10-20 07:00 London → step at 08:00 is next
    const r = nextStepFromPlan(feed, new Date("2026-10-20T07:00:00Z"));
    expect(r?.kind).toBe("light_exposure");
    expect(r?.city).toBe("London");
    expect(r?.speech).toContain("today");
  });

  test("in-progress step counts (end still ahead)", () => {
    const feed = {
      trip: TRIP,
      days: days([1, "D-1", [iv("light_exposure", 480, 600)]]),
    };
    const r = nextStepFromPlan(feed, new Date("2026-10-20T08:30:00Z"));
    expect(r?.kind).toBe("light_exposure");
  });

  test("crosses the flight-day zone switch", () => {
const feed2 = {
      trip: TRIP,
      days: days([3, "D+1", [iv("exercise", 480), iv("sleep_window", 1260)]]),
    };
    const r = nextStepFromPlan(feed2, new Date("2026-10-22T00:00:00Z"));
    // Tokyo sleep_window 21:00 on Oct 22 = 12:00Z — upcoming vs now 00:00Z Oct 22? 
    expect(r?.kind).toBe("sleep_window");
    expect(r?.city).toBe("Tokyo");
  });

  test("wraps a past-midnight sleep window", () => {
    const feed = {
      trip: TRIP,
      days: days([0, "D-2", [iv("sleep_window", 1380, 300)]]), // 23:00–05:00 London
    };
    // 2026-10-19 23:30 London = 23:30Z — inside the window
    const r = nextStepFromPlan(feed, new Date("2026-10-19T23:30:00Z"));
    expect(r?.kind).toBe("sleep_window");
  });

  test("all steps past → null", () => {
    const feed = { trip: TRIP, days: days([0, "D-2", [iv("exercise", 480, 540)]]) };
    expect(nextStepFromPlan(feed, new Date("2027-01-01T00:00:00Z"))).toBeNull();
  });

  test("tomorrow wording", () => {
    const feed = {
      trip: TRIP,
      days: days([1, "D-1", [iv("light_exposure", 480)]]),
    };
    // 2026-10-19 23:00 London → next is tomorrow 08:00 London
    const r = nextStepFromPlan(feed, new Date("2026-10-19T23:00:00Z"));
    expect(r?.speech).toContain("tomorrow");
  });
});
