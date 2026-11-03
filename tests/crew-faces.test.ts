import { describe, expect, it } from "bun:test";
import { agentMoods, lastVerdict } from "../src/components/CrewFaces";
import type { CrewEvent } from "../src/domain/types";

const ev = (partial: Partial<CrewEvent>): CrewEvent => partial as CrewEvent;

describe("agentMoods — the crew's state channel", () => {
  it("empty stream → everyone idle", () => {
    expect(agentMoods([])).toEqual({
      analyst: "idle", researcher: "idle", planner: "idle", evaluator: "idle", negotiator: "idle",
    });
  });

  it("work, tools, questions and verdicts each move the right face", () => {
    const moods = agentMoods([
      ev({ type: "agent_start", agent: "analyst" }),
      ev({ type: "tool_call", agent: "analyst", tool: "searchScience", detail: "" }),
      ev({ type: "crew_question", question: { agent: "planner", text: "?", options: [] } }),
      ev({ type: "eval_result", result: { feasible: false, violations: [{ code: "x" }] }, attempt: 1 }),
    ]);
    expect(moods.analyst).toBe("searching");
    expect(moods.planner).toBe("asking");
    expect(moods.evaluator).toBe("worried");
    expect(moods.researcher).toBe("idle");
  });

  it("a pass cheers the evaluator and agent_end settles the worker", () => {
    const moods = agentMoods([
      ev({ type: "agent_start", agent: "negotiator" }),
      ev({ type: "eval_result", result: { feasible: true, score: 0.9, violations: [] }, attempt: 1 }),
      ev({ type: "agent_end", agent: "negotiator" }),
    ]);
    expect(moods.evaluator).toBe("happy");
    expect(moods.negotiator).toBe("settled");
  });

  it("the fold follows the narration that comes right after a verdict", () => {
    // Both emitters send eval_result immediately before Iris's agent_start, so
    // the fold alone must not be the thing carrying the verdict — CrewFaces
    // holds `lastVerdict` for one beat and then hands the face back.
    const verdict = ev({ type: "eval_result", result: { feasible: false, violations: [{ code: "SHIFT_TOO_FAST" }] }, attempt: 1 });
    const moods = agentMoods([
      verdict,
      ev({ type: "agent_start", agent: "evaluator" }),
      ev({ type: "agent_token", agent: "evaluator", text: "Rejected." }),
    ]);
    expect(moods.evaluator).toBe("working");

    const after = agentMoods([
      ev({ type: "eval_result", result: { feasible: false, violations: [{ code: "x" }] }, attempt: 1 }),
      ev({ type: "agent_start", agent: "evaluator" }),
      ev({ type: "eval_result", result: { feasible: true, score: 0.9, violations: [] }, attempt: 2 }),
    ]);
    expect(after.evaluator).toBe("happy");
  });

  it("lastVerdict reports the newest verdict, failure or pass", () => {
    const fail = ev({ type: "eval_result", result: { feasible: false, violations: [{ code: "x" }] }, attempt: 1 });
    const pass = ev({ type: "eval_result", result: { feasible: true, score: 0.9, violations: [] }, attempt: 2 });
    expect(lastVerdict([])).toBeNull();
    expect(lastVerdict([ev({ type: "agent_start", agent: "analyst" })])).toBeNull();
    expect(lastVerdict([fail, ev({ type: "agent_start", agent: "evaluator" }), pass])).toEqual({
      event: pass,
      mood: "happy",
    });
    expect(lastVerdict([fail])).toEqual({ event: fail, mood: "worried" });
  });

  it("a locked day hands the evaluator the same cheer a pass does", () => {
    const lock = ev({ type: "day_locked", day: {} as never, sunProgress: 0.2 });
    expect(lastVerdict([lock])?.mood).toBe("happy");
  });

  it("done settles whoever is still standing", () => {
    const moods = agentMoods([ev({ type: "agent_start", agent: "planner" }), ev({ type: "done" })]);
    expect(moods.planner).toBe("settled");
  });
});
