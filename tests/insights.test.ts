import { describe, expect, test } from "bun:test";
import { insightCards, insightFlagCount } from "../src/domain/insights";
import { evaluatePlan, coverageOf, fmtMin } from "../src/domain/circadian";
import { bodyClockMin } from "../src/domain/readiness";
import { ASSUMED_MORNING_MIN } from "../src/domain/route-gap";
import { performanceMoment } from "../src/domain/trip-performance";
import { previewPlan } from "../src/domain/solver";
import {
  buildTrip,
  calendarFor,
  ADHERENCE_PROFILE,
  GARMIN_BASELINE,
} from "../src/domain/fixtures";
import type { CalendarEvent } from "../src/domain/types";

/* InsightCards (agent-native step 6): a card exists only where its fact
 * exists — the gap read, a real evaluatePlan flag, a resolved pin. These
 * tests pin the honesty law: no conflicts → no conflict card, no pin →
 * no place card, and every number is the same function's output the
 * surface already reads. */

const TRIP = buildTrip("LHR", "HND", "2026-10-18");
const CAL = calendarFor(TRIP);
const PREVIEW = previewPlan({
  trip: TRIP,
  calendar: CAL,
  adherence: ADHERENCE_PROFILE,
  baseline: GARMIN_BASELINE,
});
const PLANS = [...PREVIEW.values()].filter(Boolean).map((s) => s!.plan);
const MOMENT = performanceMoment({
  trip: TRIP,
  calendar: CAL,
  plans: PLANS,
  baseline: GARMIN_BASELINE,
});
const OWED = coverageOf(TRIP, PLANS).residualMin;

const base = {
  trip: TRIP,
  owedMin: OWED,
  plans: PLANS,
  plansArePreview: true,
  moment: MOMENT,
  calendar: CAL,
  adherence: ADHERENCE_PROFILE,
  baseline: GARMIN_BASELINE,
};

describe("insight cards — the gap card reads real numbers", () => {
  test("no trip means no cards at all", () => {
    expect(insightCards({ ...base, trip: null })).toEqual([]);
  });

  test("the marked event's numbers are the performance moment's", () => {
    const card = insightCards(base).find((c) => c.id === "gap")!;
    expect(MOMENT).not.toBeNull();
    expect(card.prose).toContain(MOMENT!.title);
    expect(card.prose).toContain(fmtMin(MOMENT!.localMin));
    expect(card.prose).toContain(fmtMin(MOMENT!.bodyMin));
    expect(card.prose).toContain("estimated");
    expect(card.action).toEqual({ label: "See the day", dayLabel: MOMENT!.dayLabel });
  });

  test("without an event the assumed 07:00 morning carries the gap", () => {
    const card = insightCards({ ...base, moment: null }).find((c) => c.id === "gap")!;
    const body = bodyClockMin(ASSUMED_MORNING_MIN, OWED, TRIP.direction);
    expect(card.prose).toContain(fmtMin(ASSUMED_MORNING_MIN));
    expect(card.prose).toContain(fmtMin(body));
    // No honest day to jump to — no pill, not a dead one.
    expect(card.action).toBeUndefined();
  });

  test("a covered body clock yields no gap card", () => {
    expect(insightCards({ ...base, owedMin: 0 }).find((c) => c.id === "gap")).toBeUndefined();
  });

  test("the curve is the coverage math, day by day", () => {
    const card = insightCards(base).find((c) => c.id === "gap")!;
    expect(card.viz.type).toBe("shift-curve");
    if (card.viz.type !== "shift-curve") return;
    expect(card.viz.requiredMin).toBe(Math.abs(TRIP.requiredShiftMin));
    expect(card.viz.days).toBe(TRIP.days.length);
    expect(card.viz.points).toHaveLength(PLANS.length);
    // Cumulative signed coverage — the same sum coverageOf reports.
    const sign = TRIP.direction === "east" ? -1 : 1;
    let acc = 0;
    for (const [i, p] of card.viz.points.entries()) {
      acc += sign * PLANS[i].shiftMin;
      expect(p.bankedMin).toBe(Math.max(0, acc));
    }
  });
});

describe("insight cards — the conflict card is the flag's existence", () => {
  test("the demo fixture flags nothing, so no card", () => {
    const verdict = evaluatePlan({
      trip: TRIP,
      days: PLANS,
      calendar: CAL,
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    expect(insightFlagCount(verdict)).toBe(0);
    expect(insightCards(base).find((c) => c.id === "conflict")).toBeUndefined();
  });

  test("a fixed event over a protected window names it, hats its span", () => {
    // A fixed 07:00–09:00 event on D-3 lands on the solved day's 07:00
    // light window — the gate's own violation (evaluating the plan against
    // the calendar as it now is, not re-solving around the event).
    const cal: CalendarEvent[] = [
      ...CAL,
      { id: "ev-conflict", title: "Site visit", dayIndex: 0, startMin: 7 * 60, endMin: 9 * 60, movable: false },
    ];
    const verdict = evaluatePlan({
      trip: TRIP,
      days: PLANS,
      calendar: cal,
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    expect(insightFlagCount(verdict)).toBeGreaterThan(0);

    const card = insightCards({ ...base, calendar: cal }).find(
      (c) => c.id === "conflict",
    )!;
    expect(card).toBeTruthy();
    expect(card.prose).toContain("Iris flagged");
    expect(card.action).toEqual({ label: "See the day", dayLabel: "D-3" });
    expect(card.viz.type).toBe("day-strip");
    if (card.viz.type !== "day-strip") return;
    // The strip carries the flagged day's real windows; the hatch is the
    // event's own span.
    expect(card.viz.windows.length).toBeGreaterThan(0);
    expect(card.viz.flag).toEqual({ startMin: 7 * 60, endMin: 9 * 60 });
  });

  test("a movable overlap the gate only notes still counts as a flag", () => {
    // Movable 07:00–08:00 over D-3's light window — a note, not a violation.
    const cal: CalendarEvent[] = [
      ...CAL,
      { id: "ev-mov", title: "Gym", dayIndex: 0, startMin: 7 * 60, endMin: 8 * 60, movable: true },
    ];
    // Force a day whose plan predates the event — use the solved day so the
    // window positions are the solver's own.
    const verdict = evaluatePlan({
      trip: TRIP,
      days: PLANS,
      calendar: cal,
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    const notes = verdict.notes.filter((n) => n.includes("overlaps movable"));
    expect(notes.length).toBeGreaterThan(0);
    const card = insightCards({ ...base, calendar: cal }).find((c) => c.id === "conflict")!;
    expect(card.prose).toContain("Iris flagged");
    expect(card.prose).toContain("negotiator");
  });
});

describe("insight cards — the crate match", () => {
  const pin = {
    placeName: "Daikanyama T-Site",
    category: "bookstore",
    startMin: 15 * 60,
    endMin: 17 * 60,
    dayLabel: "D+1",
    kept: false,
  };

  test("no pin, no card", () => {
    expect(insightCards(base).find((c) => c.id === "place")).toBeUndefined();
  });

  test("the pin's day, window and category are quoted", () => {
    const card = insightCards({ ...base, pin }).find((c) => c.id === "place")!;
    expect(card.prose).toContain("Daikanyama T-Site");
    expect(card.prose).toContain("bookstore");
    expect(card.prose).toContain("15:00–17:00");
    expect(card.action).toEqual({ label: "See this day", dayLabel: "D+1" });
  });

  test("sample-sourced pins say so on the tag", () => {
    const tagged = insightCards({ ...base, pin, pinSample: "recorded" }).find(
      (c) => c.id === "place",
    )!;
    expect(tagged.tag).toBe("Example schedule");
    const live = insightCards({ ...base, pin }).find((c) => c.id === "place")!;
    expect(live.tag).toBeUndefined();
  });
});

describe("insight cards — disclosure tags", () => {
  test("preview plans tag Preview; example mode tags Example plan; locked is untagged", () => {
    const preview = insightCards(base).find((c) => c.id === "gap")!;
    expect(preview.tag).toBe("Preview");
    const example = insightCards({ ...base, example: true }).find((c) => c.id === "gap")!;
    expect(example.tag).toBe("Example plan");
    const locked = insightCards({ ...base, plansArePreview: false }).find((c) => c.id === "gap")!;
    expect(locked.tag).toBeUndefined();
  });
});
