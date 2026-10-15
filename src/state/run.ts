// The single source of truth every lens reads. A pure reducer over the crew
// event stream: the world is the event stream — nothing on screen changes
// unless an event changed it here.
//
//   const { run, dispatch, reset } = useRunState();
//   es.onmessage = (m) => dispatch(JSON.parse(m.data));
//
// Lenses take slices of `run` as props; see docs/hackathon-plan.md §3.

import { useCallback, useReducer, useRef } from "react";
import { passes, sunProgress } from "@/domain/circadian";
import type {
  AgentId,
  CalendarEvent,
  CalendarMove,
  CheckIn,
  Citation,
  CrewEvent,
  DayPlan,
  EvalResult,
  ShiftCoverage,
  Trip,
  WearableBaseline,
} from "@/domain/types";

export interface ShiftDraft {
  plan: DayPlan;
  attempt: number;
}

export interface Briefing {
  summary: string;
  ics: string;
  score: number;
  citations: Citation[];
  days: DayPlan[];
  /** How much of the required shift the locked days cover. `undefined` on
   *  briefings recorded before coverage was measured, so old fixtures and
   *  persisted events still load. */
  coverage?: ShiftCoverage;
}

export interface StampedEvent {
  /** ms since run_start (wall clock of arrival, or fixture time in playback). */
  t: number;
  event: CrewEvent;
}

export interface RunState {
  phase: "idle" | "running" | "done";
  provider?: string;
  trip: Trip | null;
  baseline?: WearableBaseline;
  /** Calendar as it was at run_start (the "before"). */
  calendar: CalendarEvent[];

  /** Agent currently holding the baton (between agent_start and agent_end). */
  activeAgent?: AgentId;
  /** Day the planner/evaluator is working on (last plan_candidate). */
  activeLabel?: string;
  /** What each agent has said in its current turn (agent_token accumulated). */
  utterance: Partial<Record<AgentId, string>>;
  /** Last tool call per agent, for "pulse to object" effects. */
  lastTool?: { agent: AgentId; tool: string; detail: string; phase: "call" | "result" };

  drafts: Map<string, ShiftDraft>;
  verdicts: Map<string, EvalResult[]>;
  locked: Map<string, DayPlan>;
  /** Days whose latest verdict failed and that are not (yet) re-drafted or locked. */
  rejected: Set<string>;
  /**
   * Days already lived when a morning replan starts. They come from the
   * previous run's locks (same route), scaled by what the check-ins say was
   * actually done, and stay in `locked` so readiness and the ghost gap count
   * them. Render them as "lived", not editable.
   */
  lived: Set<string>;
  /** The previous run's locks, kept across run_start for the morning carry-over. */
  priorLocked?: { route: string; days: Map<string, DayPlan>; moves: CalendarMove[] };

  moves: CalendarMove[];
  citations: Citation[];
  checkIns: CheckIn[];
  replans: { droppedDays: number[]; reason: string }[];
  errors: { message: string; recoverable: boolean }[];
  sunProgress: number;
  briefing?: Briefing;

  /** Counters for the mission clock. */
  toolCalls: number;
  attempts: number;
  rejections: number;
  /** ms since run_start of the latest event. */
  elapsedMs: number;

  /**
   * Director focus: the lens the latest *meaningful* event belongs to, and a
   * counter that bumps on every such event. Computed here, inside the reducer,
   * because React batches fast event bursts — a `lastEvent` effect only sees
   * the final event of a batch and misses plan_candidate / calendar_move.
   *   useEffect(() => { if (auto && run.focus) setLens(run.focus) }, [run.focusSeq])
   */
  focus?: Focus;
  focusSeq: number;

  lastEvent?: CrewEvent;
  log: StampedEvent[];
}

export type Focus = "world" | "board" | "calendar" | "ledger";

/** Which lens an event belongs to (null = doesn't move the camera). */
export function focusFor(event: CrewEvent): Focus | null {
  switch (event.type) {
    case "citation":
    case "run_start":
      return "world";
    case "plan_candidate":
    case "eval_result":
    case "day_locked":
    case "check_in":
    case "replan":
    case "briefing":
      return "board";
    case "calendar_move":
      return "calendar";
    case "error":
      return "ledger";
    default:
      return null;
  }
}

export const initialRunState = (): RunState => ({
  phase: "idle",
  trip: null,
  calendar: [],
  utterance: {},
  drafts: new Map(),
  verdicts: new Map(),
  locked: new Map(),
  rejected: new Set(),
  lived: new Set(),
  moves: [],
  citations: [],
  checkIns: [],
  replans: [],
  errors: [],
  sunProgress: 0,
  toolCalls: 0,
  attempts: 0,
  rejections: 0,
  elapsedMs: 0,
  focusSeq: 0,
  log: [],
});

export type RunAction =
  | { kind: "event"; event: CrewEvent; t?: number }
  | { kind: "batch"; items: StampedEvent[] }
  | { kind: "reset" };

const withMap = <K, V>(m: Map<K, V>, k: K, v: V) => new Map(m).set(k, v);
const withoutSet = <T,>(s: Set<T>, v: T) => {
  const n = new Set(s);
  n.delete(v);
  return n;
};

/** Apply one event. Pure; never mutates `s`. */
export function applyEvent(s: RunState, event: CrewEvent, t = s.elapsedMs): RunState {
  const next = applyEventInner(s, event, t);
  const f = focusFor(event);
  return f ? { ...next, focus: f, focusSeq: s.focusSeq + 1 } : next;
}

function applyEventInner(s: RunState, event: CrewEvent, t: number): RunState {
  const base: RunState = { ...s, lastEvent: event, elapsedMs: t, log: [...s.log, { t, event }] };

  switch (event.type) {
    case "run_start": {
      // Keep the previous run's locks (merged over any older carry-over) so a
      // morning replan on the same route can mark the lived days.
      const route = routeKey(event.trip);
      const prior = new Map([
        ...(s.priorLocked?.route === route ? s.priorLocked.days : []),
        ...(s.trip && routeKey(s.trip) === route ? s.locked : []),
      ]);
      return {
        ...initialRunState(),
        phase: "running",
        provider: event.provider,
        trip: event.trip,
        baseline: event.baseline,
        calendar: event.calendar,
        priorLocked: prior.size
          ? {
              route,
              days: prior,
              moves: s.moves.length && s.trip && routeKey(s.trip) === route ? s.moves : (s.priorLocked?.moves ?? []),
            }
          : undefined,
        lastEvent: event,
        elapsedMs: 0,
        log: [{ t: 0, event }],
      };
    }

    case "agent_start":
      return { ...base, activeAgent: event.agent, utterance: { ...s.utterance, [event.agent]: "" } };

    case "agent_token":
      return {
        ...base,
        utterance: { ...s.utterance, [event.agent]: (s.utterance[event.agent] ?? "") + event.text },
      };

    case "agent_end":
      return { ...base, activeAgent: s.activeAgent === event.agent ? undefined : s.activeAgent };

    case "tool_call":
      return {
        ...base,
        toolCalls: s.toolCalls + 1,
        lastTool: { agent: event.agent, tool: event.tool, detail: event.detail, phase: "call" },
      };

    case "tool_result":
      return { ...base, lastTool: { agent: event.agent, tool: event.tool, detail: event.detail, phase: "result" } };

    case "citation":
      return s.citations.some((c) => c.id === event.citation.id)
        ? base
        : { ...base, citations: [...s.citations, event.citation] };

    case "plan_candidate": {
      const label = event.day.label;
      const prev = s.drafts.get(label);
      return {
        ...base,
        activeLabel: label,
        attempts: s.attempts + 1,
        drafts: withMap(s.drafts, label, { plan: event.day, attempt: (prev?.attempt ?? 0) + 1 }),
        // A fresh draft supersedes the stale FAIL — the day goes back under
        // the scanner instead of staying red while Iris re-reads it.
        rejected: withoutSet(s.rejected, label),
      };
    }

    case "eval_result": {
      // eval_result carries no label: it judges the latest candidate.
      const label = s.activeLabel;
      if (!label) return base;
      const ok = passes(event.result);
      return {
        ...base,
        verdicts: withMap(s.verdicts, label, [...(s.verdicts.get(label) ?? []), event.result]),
        rejected: ok ? withoutSet(s.rejected, label) : new Set(s.rejected).add(label),
        rejections: s.rejections + (ok ? 0 : 1),
      };
    }

    case "day_locked":
      return {
        ...base,
        locked: withMap(s.locked, event.day.label, event.day),
        rejected: withoutSet(s.rejected, event.day.label),
        sunProgress: event.sunProgress,
      };

    case "calendar_move":
      return { ...base, moves: [...s.moves, event.move] };

    case "briefing": {
      const { summary, ics, score, citations, days, coverage } = event;
      return { ...base, briefing: { summary, ics, score, citations, days, coverage } };
    }

    case "error":
      return { ...base, errors: [...s.errors, { message: event.message, recoverable: event.recoverable }] };

    case "check_in":
      return { ...base, checkIns: [...s.checkIns, event.checkIn] };

    case "replan": {
      // `droppedDays` are the days already lived (before the morning's start
      // day): they're dropped from *planning*, not from the trip. Carry them
      // over from the previous run, scaled by the check-ins. Every other day
      // dissolves back to queued and is re-planned.
      const days = s.trip?.days ?? [];
      const lived = new Set(days.filter((d) => event.droppedDays.includes(d.dayIndex)).map((d) => d.label));
      const keepLived = <V,>(m: Map<string, V>) => new Map([...m].filter(([k]) => lived.has(k)));
      const locked = keepLived(s.locked);
      for (const label of lived) {
        const plan = locked.get(label) ?? s.priorLocked?.days.get(label);
        if (plan) locked.set(label, asLived(plan, s.checkIns));
      }
      return {
        ...base,
        drafts: keepLived(s.drafts),
        verdicts: keepLived(s.verdicts),
        locked,
        lived: new Set([...lived].filter((l) => locked.has(l))),
        rejected: new Set([...s.rejected].filter((l) => lived.has(l))),
        replans: [...s.replans, { droppedDays: event.droppedDays, reason: event.reason }],
        // The night shift's calendar moves still hold unless this run makes new ones.
        moves: s.moves.length ? s.moves : (s.priorLocked?.moves ?? []),
        sunProgress: s.trip ? sunProgress(s.trip, [...locked.values()]) : s.sunProgress,
        briefing: undefined,
      };
    }

    case "done":
      return { ...base, phase: "done", activeAgent: undefined };

    default:
      return base;
  }
}

const routeKey = (trip: Trip) => `${trip.origin.code}-${trip.destination.code}`;

/**
 * What a lived day actually achieved. A skipped light anchor counts the day's
 * shift at half; a partial or harder-than-planned one at three quarters. This
 * is a display heuristic for readiness, not physiology — the scorer never
 * sees it.
 */
const CHECK_IN_FACTOR: Partial<Record<CheckIn["status"], number>> = { skipped: 0.5, partial: 0.75, harder: 0.75 };

export function asLived(plan: DayPlan, checkIns: CheckIn[]): DayPlan {
  const factor = checkIns
    .filter((c) => c.dayIndex === plan.dayIndex && (!c.kind || c.kind === "light_exposure"))
    .reduce((f, c) => Math.min(f, CHECK_IN_FACTOR[c.status] ?? 1), 1);
  if (factor === 1) return plan;
  return { ...plan, shiftMin: Math.round((plan.shiftMin * factor) / 5) * 5 };
}

export function reduceRun(s: RunState, a: RunAction): RunState {
  switch (a.kind) {
    case "reset": {
      // Clear the screen but remember this run's locks for a morning replan
      // on the same route (run_start checks the route before using them).
      const carry = s.trip && s.locked.size
        ? {
            route: routeKey(s.trip),
            days: new Map([...(s.priorLocked?.days ?? []), ...s.locked]),
            moves: s.moves.length ? s.moves : (s.priorLocked?.moves ?? []),
          }
        : s.priorLocked;
      return { ...initialRunState(), priorLocked: carry };
    }
    case "event":
      return applyEvent(s, a.event, a.t);
    case "batch":
      return a.items.reduce((acc, it) => applyEvent(acc, it.event, it.t), s);
  }
}

/** React binding. `dispatch(event)` stamps wall-clock time since run_start. */
export function useRunState() {
  const [run, send] = useReducer(reduceRun, undefined, initialRunState);
  const startedAt = useRef<number | null>(null);
  const dispatch = useCallback(
    (event: CrewEvent) => {
      if (event.type === "run_start") startedAt.current = Date.now();
      send({ kind: "event", event, t: startedAt.current ? Date.now() - startedAt.current : 0 });
    },
    [startedAt],
  );
  const reset = useCallback(() => send({ kind: "reset" }), []);
  return { run, dispatch, reset, send };
}

// --- Selectors -------------------------------------------------------------

/** The calendar after the negotiator's moves (the "after" in Calendar lens). */
export function calendarAfter(run: RunState): CalendarEvent[] {
  const byId = new Map(run.moves.map((m) => [m.eventId, m]));
  return run.calendar.map((e) => {
    const m = byId.get(e.id);
    return m ? { ...e, dayIndex: m.to.dayIndex, startMin: m.to.startMin, endMin: m.to.endMin } : e;
  });
}

/**
 * Original events with `movedTo` set from the negotiator's moves — the shape
 * CalendarLens animates (ghost at the old slot, solid block at the new one).
 */
export function calendarWithMoves(run: RunState): CalendarEvent[] {
  const byId = new Map(run.moves.map((m) => [m.eventId, m]));
  return run.calendar.map((e) => {
    const m = byId.get(e.id);
    return m ? { ...e, movedTo: { ...m.to } } : e;
  });
}

/** The ledger's events, oldest first, with streamed token fragments folded away. */
export function ledgerEvents(run: RunState): CrewEvent[] {
  return run.log.map((l) => l.event).filter((e) => e.type !== "agent_token");
}

export type DayStatus = "queued" | "draft" | "scanning" | "rejected" | "locked";

/** Status of one day row, consistent across lenses. */
export function dayStatus(run: RunState, label: string): DayStatus {
  if (run.locked.has(label)) return "locked";
  if (run.rejected.has(label)) return "rejected";
  if (run.drafts.has(label)) {
    const nVerdicts = run.verdicts.get(label)?.length ?? 0;
    return nVerdicts < (run.drafts.get(label)?.attempt ?? 0) ? "scanning" : "draft";
  }
  return "queued";
}

/** Degrees of longitude between the body's dawn and the destination's dawn. */
export function ghostGapDeg(run: RunState): number {
  if (!run.trip) return 0;
  return (Math.abs(run.trip.requiredShiftMin) / 60) * 15 * (1 - run.sunProgress);
}
