import { describe, expect, test } from "bun:test";
import { upcomingReminders } from "@/lib/reminders";
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

describe("upcomingReminders", () => {
  test("returns steps in the next 24h, soonest first", () => {
    const now = new Date("2026-10-19T06:00:00Z");
    const r = upcomingReminders(
      TRIP,
      days([
        0,
        "D-2",
        [iv("sleep_window", 1320), iv("light_exposure", 480)],
      ]),
      now,
    );
    expect(r.map((x) => x.id)).toEqual(["D-2-sunlight", "D-2-sleep"]);
  });

  test("steps already past are skipped", () => {
    const now = new Date("2026-10-19T09:00:00Z"); // after the 08:00 light step
    const r = upcomingReminders(TRIP, days([0, "D-2", [iv("light_exposure", 480)]]), now);
    expect(r).toEqual([]);
  });

  test("steps beyond the horizon are skipped", () => {
    const now = new Date("2026-10-19T06:00:00Z");
    // 2026-10-22 is ~3 days out — outside the default 24h window
    const r = upcomingReminders(TRIP, days([3, "D+1", [iv("light_exposure", 480)]]), now);
    expect(r).toEqual([]);
  });

  test("non-reminder kinds earn no nudge", () => {
    const now = new Date("2026-10-19T06:00:00Z");
    const r = upcomingReminders(
      TRIP,
      days([0, "D-2", [iv("melatonin", 600), iv("nap", 900)]]),
      now,
    );
    expect(r).toEqual([]);
  });

  test("post-flight steps are timed in destination zone", () => {
    // Tokyo sleep_window 21:00 = 12:00Z on 2026-10-22
    const r = upcomingReminders(
      TRIP,
      days([3, "D+1", [iv("sleep_window", 1260)]]),
      new Date("2026-10-22T00:00:00Z"),
      36 * 3600 * 1000,
    );
    expect(r).toHaveLength(1);
    expect(r[0].at).toBe(Date.parse("2026-10-22T12:00:00Z"));
    expect(r[0].id).toBe("D+1-sleep");
  });
});
