import { describe, expect, test } from "bun:test";
import { buildShiftWeekPlan, POST_SHIFT_DRIVING_WARNING } from "../src/domain/shift-work";

describe("the rotating shift week", () => {
  test("is seven days, Monday to Sunday, with the dates to match", () => {
    const week = buildShiftWeekPlan();
    expect(week).toHaveLength(7);
    expect(week.map((d) => d.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(week[0].date).toBe("2026-10-19");
    expect(week[6].date).toBe("2026-10-25");
  });

  test("the body clock moves only where there are light cues", () => {
    const week = buildShiftWeekPlan();
    expect(week.filter((d) => d.modelledShiftMin !== 0).length).toBeGreaterThan(0);
    // The do-nothing baseline never moves: the worker who just gets on with it
    // keeps their day-off schedule, and the delay owed never shrinks.
    for (const day of week) {
      expect(day.baselineMisalignmentHours).toBe(week[0].baselineMisalignmentHours);
    }
  });

  test("the delay owed to working nights shrinks by what the cues buy, and no further", () => {
    const week = buildShiftWeekPlan();
    // The metric is a delay, not a circular distance: a body reading 03:20
    // that needs to read 18:00 is fifteen hours of delay away.
    expect(week[0].misalignmentHours).toBe(15);
    // Every day's cues are credited, and nothing is credited that was not
    // earned: the delay owed falls by the modelled shift, no more.
    for (let i = 1; i < week.length; i++) {
      const drop = week[i - 1].misalignmentHours - week[i].misalignmentHours;
      // The reported hours are rounded to a tenth, so allow that much.
      expect(Math.abs(drop - week[i].modelledShiftMin / 60)).toBeLessThanOrEqual(0.11);
    }
    // And the plan beats doing nothing by the end of the week.
    expect(week[6].misalignmentHours).toBeLessThan(week[6].baselineMisalignmentHours);
  });

  test("handing over the school pickup buys an hour of sleep before the last night", () => {
    const without = buildShiftWeekPlan({ partnerCoversAfternoonPickup: false });
    const with_ = buildShiftWeekPlan({ partnerCoversAfternoonPickup: true });
    const thuDefault = without[3];
    const thuAdapted = with_[3];

    expect(thuDefault.plannedSleepStartMin).toBe(16 * 60);
    expect(thuAdapted.plannedSleepStartMin).toBe(15 * 60);
    // The whole trade: an extra hour of sleep before the last night shift.
    expect(thuAdapted.plannedSleepMinutes).toBe(thuDefault.plannedSleepMinutes + 60);
    expect(thuDefault.plannedSleepMinutes).toBe(5 * 60);

    // The pickup is negotiable, and the plan says so.
    const pickup = thuAdapted.commitments.find((c) => c.id === "school-pickup");
    expect(pickup?.negotiable).toBe(true);
    expect(pickup?.active).toBe(false);
    expect(pickup?.tradeOffIfMoved).toContain("extra hour of sleep");
  });

  test("the night shift and the day job are fixed, not negotiable", () => {
    const week = buildShiftWeekPlan();
    for (const day of week) {
      for (const c of day.commitments) {
        if (c.category === "work") expect(c.negotiable).toBe(false);
      }
    }
  });

  test("the morning drive after a night shift carries the safety warning", () => {
    const week = buildShiftWeekPlan();
    const tue = week[1];
    expect(tue.dayType).toBe("night_shift");
    expect(tue.postShiftSafetyWarning).toBe(POST_SHIFT_DRIVING_WARNING);
    expect(tue.postShiftSafetyWarning).toContain("cannot assess whether you are fit to drive");
    // The day off that follows a night shift is not a safety moment.
    expect(week[4].postShiftSafetyWarning).toBeUndefined();
  });

  test("the band is present and the numbers stay inside it", () => {
    const week = buildShiftWeekPlan({ wearableOptedIn: true });
    for (const day of week) {
      expect(day.uncertaintyHalfWidthMin).toBeGreaterThan(0);
      expect(day.misalignmentLowHours).toBeLessThanOrEqual(day.misalignmentHours);
      expect(day.misalignmentHighHours).toBeGreaterThanOrEqual(day.misalignmentHours);
    }
  });

  test("a skipped day is not credited with the light it did not get", () => {
    const done = buildShiftWeekPlan();
    const skipped = buildShiftWeekPlan({ skippedDayIndices: new Set([1]) });
    expect(skipped[1].modelledShiftMin).toBeLessThan(done[1].modelledShiftMin);
    expect(skipped[1].misalignmentHours).toBeGreaterThanOrEqual(done[1].misalignmentHours);
  });
});
