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

  test("the briefing carries coverage through to the handoff card", () => {
    const briefing = events.find((e) => e.event.type === "briefing");
    expect(briefing).toBeDefined();
    const run = reduceRun(initialRunState(), {
      kind: "batch",
      items: [
        ...events.slice(0, events.indexOf(briefing!)),
        {
          ...briefing!,
          event: {
            ...(briefing!.event as { type: "briefing" }),
            coverage: {
              requiredMin: 480,
              achievedMin: 380,
              residualMin: 100,
              ratio: 380 / 480,
              daysTotal: 5,
              daysPlanned: 5,
              complete: false,
            },
          },
        } as StampedEvent,
      ],
    });
    expect(run.briefing?.coverage?.residualMin).toBe(100);
    expect(run.briefing?.coverage?.complete).toBe(false);
  });

  test("a briefing recorded before coverage existed still loads", () => {
    const legacy = { ...events[events.length - 1], event: { type: "briefing", summary: "legacy", ics: "", score: 0.9, citations: [], days: [] } } as unknown as StampedEvent;
    const s = reduceRun(initialRunState(), { kind: "batch", items: [legacy] });
    expect(s.briefing?.summary).toBe("legacy");
    expect(s.briefing?.coverage).toBeUndefined();
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

  test("a re-drafted day goes back under the scanner instead of staying rejected", () => {
    const failIdx = events.findIndex(
      (e) => e.event.type === "eval_result" && !(e.event.result.feasible && e.event.result.score >= 0.75),
    );
    const retryIdx = events.findIndex((e, i) => i > failIdx && e.event.type === "plan_candidate");
    expect(retryIdx).toBeGreaterThan(failIdx);
    const label = (events[retryIdx].event as Extract<CrewEvent, { type: "plan_candidate" }>).day.label;
    const run = replay(retryIdx + 1);
    expect(run.rejected.has(label)).toBe(false);
    expect(dayStatus(run, label)).toBe("scanning");
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

  test("morning replan keeps the lived days from the night run, scaled by check-ins", () => {
    const night = replay();
    const start = events[0].event; // run_start, same route
    const morning = reduceRun(night, {
      kind: "batch",
      items: [
        { t: 0, event: start },
        {
          t: 1,
          event: {
            type: "check_in",
            checkIn: { id: "ci-1", dayIndex: 1, kind: "light_exposure", status: "skipped", at: 0 },
          },
        },
        { t: 2, event: { type: "replan", droppedDays: [0, 1], reason: "morning shift" } },
      ],
    });
    const [d3, d2, d1] = night.trip!.days.map((d) => d.label);
    expect([...morning.lived]).toEqual([d3, d2]);
    expect(morning.locked.get(d3)!.shiftMin).toBe(night.locked.get(d3)!.shiftMin);
    // D-2's light anchor was skipped: counted at half.
    expect(Math.abs(morning.locked.get(d2)!.shiftMin)).toBeLessThan(Math.abs(night.locked.get(d2)!.shiftMin));
    expect(dayStatus(morning, d1)).toBe("queued");
    expect(morning.sunProgress).toBeGreaterThan(0);
    expect(morning.briefing).toBeUndefined();
  });

  test("carry-over survives the page's reset() before the morning stream", () => {
    const night = replay();
    const cleared = reduceRun(night, { kind: "reset" });
    expect(cleared.locked.size).toBe(0);
    const morning = reduceRun(cleared, {
      kind: "batch",
      items: [
        { t: 0, event: events[0].event },
        { t: 1, event: { type: "replan", droppedDays: [0, 1], reason: "morning shift" } },
      ],
    });
    expect(morning.lived.size).toBe(2);
    // Rex's night-shift moves still hold in the morning calendar.
    expect(morning.moves).toEqual(night.moves);
  });

  test("a run on a different route carries nothing over", () => {
    const night = replay();
    const other = { ...(events[0].event as Extract<CrewEvent, { type: "run_start" }>) };
    other.trip = { ...other.trip, destination: { ...other.trip.destination, code: "SIN" } };
    const next = reduceRun(night, { kind: "event", event: other });
    expect(next.priorLocked).toBeUndefined();
  });

  test("the session clock and tool-call count survive reset() on the same route", () => {
    const night = replay();
    expect(night.toolCalls).toBeGreaterThan(0);
    const cleared = reduceRun(night, { kind: "reset" });
    expect(cleared.sessionStartedAt).toBeDefined();
    expect(cleared.priorToolCalls).toBe(night.toolCalls);
    const morning = reduceRun(cleared, { kind: "event", event: events[0].event });
    // Same route as the night run: the morning stream resumes the session
    // instead of starting the clock and counters over from zero.
    expect(morning.sessionStartedAt).toBe(cleared.sessionStartedAt);
    expect(morning.priorToolCalls).toBe(night.toolCalls);
    expect(morning.toolCalls).toBe(0); // per-stream counter does reset
  });

  test("a run on a different route starts a fresh session", () => {
    const night = replay();
    const cleared = reduceRun(night, { kind: "reset" });
    const other = { ...(events[0].event as Extract<CrewEvent, { type: "run_start" }>) };
    other.trip = { ...other.trip, destination: { ...other.trip.destination, code: "SIN" } };
    const next = reduceRun(cleared, { kind: "event", event: other });
    // A genuinely different trip doesn't inherit the old session's work —
    // exact timestamps aren't asserted since both paths legitimately call
    // Date.now() and could coincide at millisecond resolution.
    expect(next.priorToolCalls).toBe(0);
    expect(next.priorAttempts).toBe(0);
  });
});

describe("briefing taste itinerary", () => {
  const itinerary = {
    destinationCode: "HND",
    destination: "Tokyo",
    departureDate: "2026-05-10",
    favorites: [{ id: "e1", name: "Björk", type: "artist" }],
    status: "no-window",
    planningMode: "replay",
    suggestions: [],
  };

  test("a briefing carrying an itinerary keeps it in run state", () => {
    const briefing = events.find((e) => e.event.type === "briefing")!;
    const run = reduceRun(initialRunState(), {
      kind: "batch",
      items: [
        ...events.slice(0, events.indexOf(briefing)),
        { ...briefing, event: { ...(briefing.event as { type: "briefing" }), tasteItinerary: itinerary } } as StampedEvent,
      ],
    });
    expect(run.briefing?.tasteItinerary).toEqual(itinerary);
  });

  test("a legacy briefing with no itinerary stays undefined", () => {
    const run = replay();
    expect(run.briefing).toBeDefined();
    expect(run.briefing?.tasteItinerary).toBeUndefined();
  });
});

describe("calendar approval events", () => {
  const start = events[0].event as Extract<CrewEvent, { type: "run_start" }>;
  const moveEvent = events.find((e) => e.event.type === "calendar_move")!.event as Extract<CrewEvent, { type: "calendar_move" }>;
  const approval = {
    id: "approval-1",
    runId: "run-1",
    kind: "calendar_write" as const,
    summary: "Apply one proposed event move?",
    moves: [moveEvent.move],
    planBlocks: [{
      dayLabel: "D-2",
      kind: "light_exposure" as const,
      startMin: 420,
      endMin: 450,
      note: "Morning light",
    }],
    expiresAt: "2026-10-18T00:30:00.000Z",
  };

  test("approval request and result are replayable run state", () => {
    const run = reduceRun(initialRunState(), {
      kind: "batch",
      items: [
        { t: 0, event: start },
        { t: 1, event: moveEvent },
        { t: 2, event: { type: "approval_request", approval } },
        {
          t: 3,
          event: {
            type: "approval_result",
            approvalId: approval.id,
            status: "applied",
            message: "Applied 1 calendar move.",
          },
        },
      ],
    });
    expect(run.approval).toEqual(approval);
    expect(run.approvalResult?.status).toBe("applied");
    expect(run.moves).toHaveLength(1);
  });

  test("calendar restore clears proposed moves and returns the original calendar", () => {
    const run = reduceRun(initialRunState(), {
      kind: "batch",
      items: [
        { t: 0, event: start },
        { t: 1, event: moveEvent },
        { t: 2, event: { type: "calendar_restore", calendar: start.calendar } },
      ],
    });
    expect(run.moves).toHaveLength(0);
    expect(run.calendar).toEqual(start.calendar);
  });
});
