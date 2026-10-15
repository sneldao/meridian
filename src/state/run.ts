// The single source of truth every lens reads. A pure reducer over the crew
// event stream: the world is the event stream — nothing on screen changes
// unless an event changed it here.
//
//   const { run, dispatch, reset } = useRunState();
//   es.onmessage = (m) => dispatch(JSON.parse(m.data));
//
// Lenses take slices of `run` as props; see docs/hackathon-plan.md §3.

import { useCallback, useReducer, useRef } from "react";
import { passes } from "@/domain/circadian";
import type {
  AgentId,
  CalendarEvent,
  CalendarMove,
  CheckIn,
  Citation,
  CrewEvent,
  DayPlan,
  EvalResult,
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
  /** Days whose latest verdict failed and that are not (yet) locked. */
  rejected: Set<string>;

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

  lastEvent?: CrewEvent;
  log: StampedEvent[];
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
  const base: RunState = { ...s, lastEvent: event, elapsedMs: t, log: [...s.log, { t, event }] };

  switch (event.type) {
    case "run_start":
      return {
        ...initialRunState(),
        phase: "running",
        provider: event.provider,
        trip: event.trip,
        baseline: event.baseline,
        calendar: event.calendar,
        lastEvent: event,
        elapsedMs: 0,
        log: [{ t: 0, event }],
      };

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
      const { type: _t, ...briefing } = event;
      return { ...base, briefing };
    }

    case "error":
      return { ...base, errors: [...s.errors, { message: event.message, recoverable: event.recoverable }] };

    case "check_in":
      return { ...base, checkIns: [...s.checkIns, event.checkIn] };

    case "replan": {
      // Dropped days dissolve: their drafts, verdicts and locks go back to queued.
      const dropped = new Set(
        (s.trip?.days ?? []).filter((d) => event.droppedDays.includes(d.dayIndex)).map((d) => d.label),
      );
      const keep = <V,>(m: Map<string, V>) => new Map([...m].filter(([k]) => !dropped.has(k)));
      return {
        ...base,
        drafts: keep(s.drafts),
        verdicts: keep(s.verdicts),
        locked: keep(s.locked),
        rejected: new Set([...s.rejected].filter((l) => !dropped.has(l))),
        replans: [...s.replans, { droppedDays: event.droppedDays, reason: event.reason }],
        briefing: undefined,
      };
    }

    case "done":
      return { ...base, phase: "done", activeAgent: undefined };

    default:
      return base;
  }
}

export function reduceRun(s: RunState, a: RunAction): RunState {
  switch (a.kind) {
    case "reset":
      return initialRunState();
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
