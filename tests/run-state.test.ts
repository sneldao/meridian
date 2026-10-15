import { describe, expect, test } from "bun:test";
import type { CrewEvent } from "../src/domain/types";
import fixture from "../src/state/fixture-events.json";
import { calendarAfter, calendarWithMoves, dayStatus, ledgerEvents, ghostGapDeg, initialRunState, reduceRun, type StampedEvent } from "../src/state/run";

const events = (fixture as unknown as { events: StampedEvent[] }).events;
const replay = (n = events.length) =>
  reduceRun(initialRunState(), { kind: "batch", items: events.slice(0, n) });

describe("run state reducer", () => {
  test("a full recorded run ends done with every day locked", () => {
    const run = replay();
    expect(run.phase).toBe("done");
    expect(run.locked.size).toBe(run.trip!.days.length);
    expect(run.rejected.size).toBe(0);
    expect(run.briefing?.ics).toContain("BEGIN:VCALENDAR");
  });

  test("counters match the event log", () => {
    const run = replay();
    const count = (t: CrewEvent["type"]) => events.filter((e) => e.event.type === t).length;
    expect(run.toolCalls).toBe(count("tool_call"));
    expect(run.attempts).toBe(count("plan_candidate"));
    expect(run.rejections).toBe(count("plan_candidate") - count("day_locked"));
    expect(run.citations.length).toBe(count("citation"));
  });

  test("a rejected day shows as rejected until it locks", () => {
    const failIdx = events.findIndex(
      (e) => e.event.type === "eval_result" && !(e.event.result.feasible && e.event.result.score >= 0.75),
    );
    expect(failIdx).toBeGreaterThan(0);
    const run = replay(failIdx + 1);
    const label = run.activeLabel!;
    expect(dayStatus(run, label)).toBe("rejected");
    expect(run.drafts.get(label)!.attempt).toBe(1);
  });

  test("a fresh draft is scanning until its verdict arrives", () => {
    const i = events.findIndex((e) => e.event.type === "plan_candidate");
    const run = replay(i + 1);
    expect(dayStatus(run, run.activeLabel!)).toBe("scanning");
  });

  test("calendarAfter applies the negotiator's moves", () => {
    const run = replay();
    const after = calendarAfter(run);
    for (const m of run.moves) {
      const e = after.find((x) => x.id === m.eventId)!;
      expect(e.startMin).toBe(m.to.startMin);
    }
  });

  test("ghost gap closes as days lock", () => {
    const start = replay(1);
    const end = replay();
    expect(ghostGapDeg(start)).toBeGreaterThan(ghostGapDeg(end));
  });

  test("director focus sees every beat even when events arrive in one batch", () => {
    const run = replay();
    const focusEvents = events.filter((e) =>
      ["citation", "run_start", "plan_candidate", "eval_result", "day_locked", "briefing", "calendar_move", "error", "check_in", "replan"].includes(e.event.type),
    ).length;
    expect(run.focusSeq).toBe(focusEvents);
    const firstMove = events.findIndex((e) => e.event.type === "calendar_move");
    expect(replay(firstMove + 1).focus).toBe("calendar");
  });

  test("calendarWithMoves keeps the original slot and sets movedTo", () => {
    const run = replay();
    const cal = calendarWithMoves(run);
    for (const m of run.moves) {
      const e = cal.find((x) => x.id === m.eventId)!;
      expect(e.startMin).toBe(m.from.startMin);
      expect(e.movedTo?.startMin).toBe(m.to.startMin);
    }
    expect(ledgerEvents(run).some((e) => e.type === "agent_token")).toBe(false);
  });

  test("replan dissolves the dropped days", () => {
    const run = replay();
    const next = reduceRun(run, {
      kind: "event",
      event: { type: "replan", droppedDays: [2, 3, 4], reason: "check-in" },
    });
    expect(next.locked.size).toBe(2);
    expect(next.briefing).toBeUndefined();
    expect(dayStatus(next, run.trip!.days[3].label)).toBe("queued");
  });
});
