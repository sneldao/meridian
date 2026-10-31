import { describe, expect, test } from "bun:test";
import { dueReminders, isoAddDays, outcomeReminder, upcomingReminders } from "@/lib/reminders";
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

describe("isoAddDays", () => {
  test("rolls over months and years on the calendar, not the clock", () => {
    expect(isoAddDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(isoAddDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(isoAddDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("outcomeReminder — the morning-after knock (round 17)", () => {
  const planned = days([3, "D+1", [iv("light_exposure", 480)]]);

  test("knocks at 08:00 destination time the morning after the last planned day", () => {
    // Last planned day 2026-10-22 (Tokyo) → knock 2026-10-23 08:00 JST = 22 23:00Z.
    const now = new Date("2026-10-22T20:00:00Z");
    const r = outcomeReminder(TRIP, planned, now, 6 * 3600 * 1000);
    expect(r).not.toBeNull();
    expect(r!.at).toBe(Date.parse("2026-10-22T23:00:00Z"));
    expect(r!.id).toBe("outcome-HND-2026-10-22");
    expect(r!.url).toBe("/outcome?origin=LHR&dest=HND&date=2026-10-22");
    expect(r!.ttlSec).toBe(12 * 3600);
    expect(r!.title).toContain("sleep");
  });

  test("the id is stable across calls so the sent-map delivers exactly once", () => {
    const a = outcomeReminder(TRIP, planned, new Date("2026-10-22T19:00:00Z"), 12 * 3600 * 1000);
    const b = outcomeReminder(TRIP, planned, new Date("2026-10-22T21:00:00Z"), 12 * 3600 * 1000);
    expect(a!.id).toBe(b!.id);
  });

  test("no planned days, no knock — there is nothing to rate", () => {
    expect(outcomeReminder(TRIP, [], new Date("2026-10-22T20:00:00Z"), 24 * 3600 * 1000)).toBeNull();
  });

  test("the knock only exists inside the dispatch window", () => {
    const early = outcomeReminder(TRIP, planned, new Date("2026-10-20T00:00:00Z"), 3600 * 1000);
    const late = outcomeReminder(TRIP, planned, new Date("2026-10-23T00:00:00Z"), 3600 * 1000);
    expect(early).toBeNull();
    expect(late).toBeNull();
  });

  test("a DST boundary is honoured — the knock is a real local 08:00", () => {
    // US DST ends 2026-11-01: JFK is UTC-4 through Oct 31, UTC-5 from Nov 1.
    const jfkTrip = {
      ...TRIP,
      destination: { code: "JFK", name: "New York", utcOffsetMin: -240 },
      days: [{ dayIndex: 0, label: "D0", date: "2026-10-31" }],
    } as Trip;
    const r = outcomeReminder(
      jfkTrip,
      days([0, "D0", [iv("light_exposure", 480)]]),
      new Date("2026-10-31T12:00:00Z"),
      48 * 3600 * 1000,
    );
    // 08:00 EST = 13:00Z — not 12:00Z, which the pre-DST offset would give.
    expect(r!.at).toBe(Date.parse("2026-11-01T13:00:00Z"));
  });
});

describe("dueReminders", () => {
  test("merges plan steps and the knock, soonest first", () => {
    const now = new Date("2026-10-22T20:00:00Z");
    const r = dueReminders(
      TRIP,
      days([3, "D+1", [iv("sleep_window", 1260), iv("light_exposure", 480)]]),
      now,
      36 * 3600 * 1000,
    );
    // 21:00 JST sleep = 12:00Z (past) is skipped by upcomingReminders;
    // the 08:00 knock (23:00Z) and any future steps remain, sorted.
    const knock = r.find((x) => x.id.startsWith("outcome-"));
    expect(knock).toBeDefined();
    const times = r.map((x) => x.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});
