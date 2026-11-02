import { describe, expect, it } from "bun:test";
import { agentMoods, AVATAR_DEFS, AGENT_IDS } from "../src/components/CrewFaces";
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

  it("each agent has its own silhouette — the avatar contract holds", () => {
    const paths = AGENT_IDS.map((id) => AVATAR_DEFS[id].path);
    expect(new Set(paths).size).toBe(5);
    for (const id of AGENT_IDS) {
      const d = AVATAR_DEFS[id];
      expect(d.path.startsWith("M")).toBe(true);
      expect(d.eyes.x2).toBeGreaterThan(d.eyes.x1);
      expect(d.eyes.y).toBeGreaterThan(0);
    }
  });

  it("done settles whoever is still standing", () => {
    const moods = agentMoods([ev({ type: "agent_start", agent: "planner" }), ev({ type: "done" })]);
    expect(moods.planner).toBe("settled");
  });
});
