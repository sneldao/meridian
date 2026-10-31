import { describe, expect, test } from "bun:test";
import fixture from "../src/state/fixture-events.json";
import {
  appendCrewEvent,
  cancelCrewRun,
  crewRun,
  eventsAfter,
  startCrewRun,
  subscribeCrewRun,
} from "../src/lib/crew-runs";
import { cancelCalendarApprovalsForRun, requestCalendarApproval, resolveCalendarApproval } from "../src/lib/calendar-approvals";
import type { StampedEvent } from "../src/state/run";

const registry = () =>
  (globalThis as typeof globalThis & { __meridianCrewRuns?: Map<string, unknown> }).__meridianCrewRuns!;

const events = (fixture as unknown as { events: StampedEvent[] }).events;
const runStart = events[0].event as Extract<(typeof events)[number]["event"], { type: "run_start" }>;

describe("crew run registry", () => {
  test("events are ordered and replayable after a cursor", () => {
    const id = `test-run-${crypto.randomUUID()}`;
    startCrewRun(id);
    appendCrewEvent(id, events[0].event);
    appendCrewEvent(id, events[1].event);
    appendCrewEvent(id, events[2].event);
    expect(eventsAfter(id, 0).map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(eventsAfter(id, 1).map((e) => e.seq)).toEqual([2, 3]);
  });

  test("a persisted partial run replays after process restart with an honest terminal error", () => {
    const id = `test-run-${crypto.randomUUID()}`;
    startCrewRun(id);
    appendCrewEvent(id, events[0].event);
    appendCrewEvent(id, events[1].event);
    registry().delete(id);

    const replayed = eventsAfter(id, 0).map((e) => e.event.type);
    expect(replayed.slice(0, 2)).toEqual([events[0].event.type, events[1].event.type]);
    expect(replayed.slice(-2)).toEqual(["error", "done"]);
  });

  test("subscribers receive new events and cancellation aborts the run", () => {
    const id = `test-run-${crypto.randomUUID()}`;
    const { signal } = startCrewRun(id);
    const seen: number[] = [];
    const unsubscribe = subscribeCrewRun(id, (e) => seen.push(e.seq));
    appendCrewEvent(id, events[0].event);
    unsubscribe();
    appendCrewEvent(id, events[1].event);
    expect(seen).toEqual([1]);
    expect(signal.aborted).toBe(false);
    expect(cancelCrewRun(id)).toBe(true);
    expect(signal.aborted).toBe(true);
    expect(crewRun(id)?.cancelled).toBe(true);
  });
});

describe("calendar approval registry", () => {
  const payload = {
    trip: runStart.trip,
    calendar: runStart.calendar,
    lockedDays: [],
    moves: [],
  };

  test("rejection resolves once without touching the calendar writer", async () => {
    const request = requestCalendarApproval({ ...payload, runId: "approval-run" });
    const result = await resolveCalendarApproval(request.approvalId, false);
    expect(result.status).toBe("rejected");
    expect(await request.result).toEqual(result);
    const again = await resolveCalendarApproval(request.approvalId, false);
    expect(again.status).toBe("failed");
  });

  test("cancelling a run resolves its pending approval without a write", async () => {
    const request = requestCalendarApproval({ ...payload, runId: "cancelled-run" });
    expect(cancelCalendarApprovalsForRun("cancelled-run")).toBe(1);
    const result = await request.result;
    expect(result.status).toBe("failed");
    expect(result.message).toContain("Run cancelled");
  });
});
