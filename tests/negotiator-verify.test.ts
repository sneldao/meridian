import { describe, expect, test } from "bun:test";
import { __internals } from "../src/agents/runtime";
import { effectiveCalendar } from "../src/domain/circadian";
import { ADHERENCE_PROFILE, CALENDAR, DEMO_TRIP, buildTrip } from "../src/domain/fixtures";
import { fallbackCitations } from "../src/tools/science";
import type { CalendarEvent, CalendarMove, DayPlan } from "../src/domain/types";

const { moveBreaksLockedPlan, verifyCommittedCalendar } = __internals;
const trip = DEMO_TRIP;
const citations = fallbackCitations();

const day = (over: Partial<DayPlan> = {}): DayPlan => ({
  dayIndex: 0,
  label: "D-3",
  shiftMin: -60,
  targetBedtimeMin: 23 * 60,
  targetWakeMin: 7 * 60,
  interventions: [{ kind: "light_exposure", startMin: 7 * 60, endMin: 8 * 60, note: "morning light" }],
  ...over,
});

const move = (over: Partial<CalendarMove> = {}): CalendarMove => ({
  eventId: "ev-gym-0",
  title: "Gym",
  from: { dayIndex: 0, startMin: 18 * 60, endMin: 19 * 60 },
  to: { dayIndex: 0, startMin: 12 * 60, endMin: 13 * 60 },
  reason: "",
  ...over,
});

describe("negotiator move preflight", () => {
  test("a move that lands on a light anchor is refused", () => {
    const onto = move({ to: { dayIndex: 0, startMin: 7 * 60 + 15, endMin: 8 * 60 + 15 } });
    expect(moveBreaksLockedPlan(onto, [day()])).toContain("light exposure");
  });

  test("a clear slot is allowed", () => {
    expect(moveBreaksLockedPlan(move(), [day()])).toBeNull();
  });

  test("a move onto a sleep window is refused", () => {
    const d = day({ interventions: [{ kind: "sleep_window", startMin: 22 * 60, endMin: 23 * 60 + 30, note: "bed" }] });
    expect(moveBreaksLockedPlan(move({ to: { dayIndex: 0, startMin: 22 * 60 + 15, endMin: 22 * 60 + 45 } }), [d])).toContain("sleep window");
  });

  test("a point-in-time ask may be coincided with", () => {
    const d = day({ interventions: [{ kind: "caffeine_cutoff", startMin: 12 * 60, note: "last coffee" }] });
    expect(moveBreaksLockedPlan(move(), [d])).toBeNull();
  });

  test("a move on another day is unaffected", () => {
    expect(moveBreaksLockedPlan(move({ to: { dayIndex: 2, startMin: 12 * 60, endMin: 13 * 60 } }), [day()])).toBeNull();
  });

  test("a window crossing midnight is compared on the overnight span", () => {
    // Bed at 23:00, up at 00:30 — endMin < startMin means the window wraps.
    const d = day({ interventions: [{ kind: "sleep_window", startMin: 23 * 60, endMin: 30, note: "bed" }] });
    const into = move({ to: { dayIndex: 0, startMin: 23 * 60 + 30, endMin: 24 * 60 + 15 } });
    expect(moveBreaksLockedPlan(into, [d])).toContain("sleep window");
  });

  // Known limitation, asserted so it cannot regress silently: a window that
  // wraps midnight is compared only against events on its own dayIndex. The
  // post-midnight tail (00:15-06:00 of a 23:00-06:00 sleep window) is therefore
  // not checked against the *next* day's events. Fixing it means normalising
  // every span to absolute multi-day minutes across circadian.ts, the
  // negotiator and the calendar lens — a refactor of the working gate, not a
  // patch to the commit verification. Until then: pre-midnight events are
  // gated, post-midnight ones are not.
  test("KNOWN LIMITATION: the post-midnight tail is not matched to the next day", () => {
    const d = day({ interventions: [{ kind: "sleep_window", startMin: 23 * 60, endMin: 6 * 60, note: "bed" }] });
    const nextDayTail = move({ to: { dayIndex: 1, startMin: 15, endMin: 45 } });
    expect(moveBreaksLockedPlan(nextDayTail, [d])).toBeNull();
  });
});

describe("committed calendar verification", () => {
  test("moves that keep the plan sound pass", () => {
    const cal: CalendarEvent[] = CALENDAR.map((e) => ({ ...e }));
    expect(verifyCommittedCalendar(cal, [day()], trip, citations, ADHERENCE_PROFILE)).toEqual([]);
  });

  test("a move that parks an event on the light anchor is caught", () => {
    const cal: CalendarEvent[] = CALENDAR.map((e) =>
      e.id === "ev-deep-0" ? { ...e, movedTo: { dayIndex: 0, startMin: 7 * 60 + 15, endMin: 8 * 60 + 15 } } : { ...e },
    );
    const found = verifyCommittedCalendar(cal, [day()], trip, citations, ADHERENCE_PROFILE);
    expect(found.length).toBeGreaterThan(0);
  });

  test("verification compares against the pre-move calendar, not an absolute", () => {
    // A plan that already had a violation must not be blamed on the negotiator:
    // only violations the moves *introduced* are reported.
    const cal: CalendarEvent[] = CALENDAR.map((e) => ({ ...e }));
    const bad = day({ interventions: [{ kind: "melatonin", startMin: 21 * 60, note: "take 3 mg melatonin" }] });
    expect(verifyCommittedCalendar(cal, [bad], trip, citations, ADHERENCE_PROFILE)).toEqual([]);
  });

  test("no locked days means nothing to verify", () => {
    expect(verifyCommittedCalendar(CALENDAR.map((e) => ({ ...e })), [], trip, citations, ADHERENCE_PROFILE)).toEqual([]);
  });

  test("verification sees moves that effectiveCalendar folds in", () => {
    const cal: CalendarEvent[] = CALENDAR.map((e) =>
      e.id === "ev-standup-0" ? { ...e, movedTo: { dayIndex: 0, startMin: 7 * 60 + 30, endMin: 8 * 60 + 30 } } : { ...e },
    );
    const eff = effectiveCalendar(cal);
    expect(eff.find((e) => e.id === "ev-standup-0")!.startMin).toBe(7 * 60 + 30);
    expect(verifyCommittedCalendar(cal, [day()], trip, citations, ADHERENCE_PROFILE).length).toBeGreaterThan(0);
  });

  test("a westward trip verifies too", () => {
    const west = buildTrip("LHR", "JFK", "2026-10-18");
    const cal: CalendarEvent[] = CALENDAR.map((e) => ({ ...e }));
    const d: DayPlan = {
      dayIndex: 0,
      label: "D-3",
      shiftMin: 60,
      targetBedtimeMin: 24 * 60 + 55,
      targetWakeMin: 7 * 60 + 45,
      interventions: [{ kind: "avoid_light", startMin: 7 * 60, endMin: 8 * 60, note: "dark glasses" }],
    };
    expect(verifyCommittedCalendar(cal, [d], west, citations, ADHERENCE_PROFILE)).toEqual([]);
  });
});
