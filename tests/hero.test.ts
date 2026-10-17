import { describe, expect, test } from "bun:test";
import { calendarSummary, heroMeeting } from "../src/domain/hero";
import { ADHERENCE_PROFILE, calendarFor, DEMO_TRIP, GARMIN_BASELINE } from "../src/domain/fixtures";
import { meetingReadiness, remainingLagMin } from "../src/domain/readiness";
import { previewPlan } from "../src/domain/solver";

// Item 13 — the compliance surface is the calendar, not the run button.
// B's shape guarantees movable/fixed counts and a readiness label from data
// the page already loaded; A renders them. The contract is asserted here so
// both lanes read the same totals.

describe("calendarSummary (item 13)", () => {
  test("counts movable and fixed, separately", () => {
    const summary = calendarSummary(calendarFor(DEMO_TRIP), []);
    // Demo calendar: 5 fixed (board, breakfast, dinner, flight, no — see
    // below), 8 movable. Let the contract speak: `fixed` is every
    // non-movable event regardless of where it sits; `movable` is the rest.
    // The flight is fixed, the board is fixed, breakfast/dinner are fixed,
    // and so is the pitch (post-arrival but still a real fixed wall). That's
    // 5 fixed and 8 movable.
    expect(summary.movable).toBe(8);
    expect(summary.fixed).toBe(5);
    expect(summary.total).toBe(0); // no readiness supplied
    expect(summary.readinessLabel).toBe("—");
  });

  test("readinessLabel reads X/Y when readiness is supplied", () => {
    const readiness = [
      { status: "ready" },
      { status: "ready" },
      { status: "risk" },
    ];
    expect(calendarSummary([], readiness).readinessLabel).toBe("2/3");
  });

  test("the empty case is honest — never invent counts to fill the meter", () => {
    const summary = calendarSummary([], []);
    expect(summary.movable).toBe(0);
    expect(summary.fixed).toBe(0);
    expect(summary.total).toBe(0);
    expect(summary.readinessLabel).toBe("—");
  });
});

// Item 15 — the hero meeting traces to a real fixed event, never a fixture
// title. The contract says: pick the earliest post-flight non-movable
// non-flight event, and name the body-time delta. Fixtures never carry
// `attendees`, which is fine — the tiebreak is "the only fixed wall on its
// day" because a real Google event would be the only fixed wall too.

describe("heroMeeting (item 15)", () => {
  test("returns null when no post-flight fixed event exists", () => {
    const out = heroMeeting({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP).filter((e) => e.movable || e.dayIndex <= DEMO_TRIP.departureDayIndex),
      locked: [],
      baseline: GARMIN_BASELINE,
    });
    expect(out).toBeNull();
  });

  test("skips the flight itself — BA005 LHR → HND is not the meeting", () => {
    const out = heroMeeting({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      locked: [],
      baseline: GARMIN_BASELINE,
    });
    expect(out).not.toBeNull();
    expect(out!.title).toBe("Client pitch");
    expect(out!.eventId).toBe("ev-pitch");
  });

  test("on demo-default the hero meeting is still real — the pitch is a real fixed event, not a fixture number", () => {
    const plan = previewPlan({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    const locked = [...plan.values()].map((d) => d.plan);
    const out = heroMeeting({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      locked,
      baseline: GARMIN_BASELINE,
    });
    expect(out).not.toBeNull();
    // The without-plan half is the full honest gap; the with-plan half is
    // where the locked days bought some lag. They differ when the plan
    // covers even part of the shift.
    if (remainingLagMin(DEMO_TRIP, locked) > 0) {
      expect(out!.bodyWithoutPlanMin).not.toBe(out!.bodyMin);
    }
  });

  test("agrees with meetingReadiness about which event wins", () => {
    const plan = previewPlan({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    const locked = [...plan.values()].map((d) => d.plan);
    const hero = heroMeeting({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      locked,
      baseline: GARMIN_BASELINE,
    });
    expect(hero).not.toBeNull();
    const all = meetingReadiness(DEMO_TRIP, calendarFor(DEMO_TRIP), locked, GARMIN_BASELINE);
    const same = all.find((m) => m.eventId === hero!.eventId);
    expect(same).toBeDefined();
    expect(same!.title).toBe(hero!.title);
    expect(same!.bodyMin).toBe(hero!.bodyMin);
    expect(same!.bodyWithoutPlanMin).toBe(hero!.bodyWithoutPlanMin);
  });

  test("a moved event follows its new slot, not the original", () => {
    // Push it back onto the same trip's last day (D+1) by widening the trip.
    // The point of the contract is that the moved slot is what gets named,
    // not the fixture's startMin.
    const tripWide = {
      ...DEMO_TRIP,
      days: [
        ...DEMO_TRIP.days,
        { dayIndex: 5, label: "D+2", date: "2026-10-21" },
      ],
    };
    const cal = calendarFor(DEMO_TRIP).map((e) =>
      e.id === "ev-pitch"
        ? { ...e, movedTo: { dayIndex: 5, startMin: 10 * 60 } }
        : e,
    );
    const out = heroMeeting({
      trip: tripWide,
      calendar: cal,
      locked: [],
      baseline: GARMIN_BASELINE,
    });
    expect(out).not.toBeNull();
    expect(out!.localMin).toBe(10 * 60);
    expect(out!.dayLabel).toBe("D+2");
  });

  test("pre-lock without a preview both halves are the full unbanked gap", () => {
    const out = heroMeeting({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      locked: [],
      baseline: GARMIN_BASELINE,
    });
    expect(out).not.toBeNull();
    expect(out!.bodyMin).toBe(out!.bodyWithoutPlanMin);
  });

  test("pre-lock with a preview the halves diverge — sales line has content", () => {
    const plan = previewPlan({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    const previewLocked = [...plan.values()]
      .filter((s) => s !== null)
      .map((s) => s!.plan);
    expect(previewLocked.length).toBeGreaterThan(0);
    const out = heroMeeting({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      locked: [],
      previewLocked,
      baseline: GARMIN_BASELINE,
    });
    expect(out).not.toBeNull();
    // The preview banks part of the shift, so the with-plan half differs
    // from the full unbanked gap — that delta is what A renders.
    if (remainingLagMin(DEMO_TRIP, previewLocked as import("../src/domain/types").DayPlan[]) < remainingLagMin(DEMO_TRIP, [])) {
      expect(out!.bodyMin).not.toBe(out!.bodyWithoutPlanMin);
    }
    expect(out!.bodyWithoutPlanMin).toBe(6 * 60);
  });

  test("pre-lock delight: with a preview the meeting reads ready, without it reads risk", () => {
    // The demo pitch at 14:00 local is 06:00 body unbanked (inside the
    // 23:10–07:30 sleep window → risk) and 09:00 with the preview's banked
    // shift (outside the window → ready). The status must follow the
    // with-plan half — the first impression is \"the crew already has you
    // covered\", not a red badge before anything has run.
    const withoutPreview = heroMeeting({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      locked: [],
      baseline: GARMIN_BASELINE,
    });
    expect(withoutPreview).not.toBeNull();
    expect(withoutPreview!.status).toBe("risk");
    const plan = previewPlan({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    const previewLocked = [...plan.values()]
      .filter((s) => s !== null)
      .map((s) => s!.plan);
    const withPreview = heroMeeting({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      locked: [],
      previewLocked,
      baseline: GARMIN_BASELINE,
    });
    expect(withPreview).not.toBeNull();
    expect(withPreview!.bodyMin).toBe(9 * 60);
    expect(withPreview!.status).toBe("ready");
  });

  test("post-lock the preview is ignored — locked wins", () => {
    const plan = previewPlan({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    const locked = [...plan.values()]
      .filter((s) => s !== null)
      .map((s) => s!.plan);
    const withPreview = heroMeeting({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      locked,
      previewLocked: [],
      baseline: GARMIN_BASELINE,
    });
    const withoutPreview = heroMeeting({
      trip: DEMO_TRIP,
      calendar: calendarFor(DEMO_TRIP),
      locked,
      baseline: GARMIN_BASELINE,
    });
    expect(withPreview).not.toBeNull();
    expect(withoutPreview).not.toBeNull();
    expect(withPreview!.bodyMin).toBe(withoutPreview!.bodyMin);
    expect(withPreview!.bodyWithoutPlanMin).toBe(withoutPreview!.bodyWithoutPlanMin);
  });
});
