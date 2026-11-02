"use client";

import { CREW } from "@/agents/crew";
import type { AgentId, CrewEvent } from "@/domain/types";

/* The crew has a face. Each agent is one blob whose body carries the
 * colour and whose eyes carry the state — bloub's split: one shape for
 * the body, an independent channel for the face. The mood is folded from
 * the event stream, never invented: what you see is what the run did. */

export type CrewMood =
  | "idle"      // not started yet — eyes shut, body dim
  | "working"   // streaming/drafting — eyes open, alert
  | "searching" // a tool call in flight — eyes look sideways
  | "asking"    // a crew_question is open — eyes wide
  | "worried"   // last verdict failed — eyes drop, body shrinks
  | "happy"     // a pass or a lock landed — body swells, eyes brighten
  | "settled";  // work done — calm eyes

const AGENT_IDS: AgentId[] = ["analyst", "researcher", "planner", "evaluator", "negotiator"];

export function agentMoods(events: CrewEvent[]): Record<AgentId, CrewMood> {
  const moods = Object.fromEntries(AGENT_IDS.map((id) => [id, "idle" as CrewMood])) as Record<AgentId, CrewMood>;
  for (const e of events) {
    switch (e.type) {
      case "agent_start":
      case "agent_token":
        moods[e.agent] = "working";
        break;
      case "tool_call":
        moods[e.agent] = "searching";
        break;
      case "tool_result":
        if (moods[e.agent] === "searching") moods[e.agent] = "working";
        break;
      case "crew_question":
        moods[e.question.agent] = "asking";
        break;
      case "crew_answer":
        break;
      case "plan_candidate":
        moods.planner = "working";
        break;
      case "calendar_move":
        moods.negotiator = "working";
        break;
      case "eval_result":
        moods.evaluator = e.result.feasible ? "happy" : "worried";
        break;
      case "day_locked":
        moods.evaluator = "happy";
        break;
      case "agent_end":
        moods[e.agent] = "settled";
        break;
      case "error":
        if (!e.recoverable) for (const id of AGENT_IDS) if (moods[id] === "working" || moods[id] === "searching" || moods[id] === "asking") moods[id] = "worried";
        break;
      case "done":
        for (const id of AGENT_IDS) if (moods[id] !== "settled") moods[id] = "settled";
        break;
    }
  }
  return moods;
}

interface EyeStyle { dx: number; ry: number; opacity: number }
interface MoodStyle { bodyScale: number; bodyOpacity: number; eyes: EyeStyle }

const MOODS: Record<CrewMood, MoodStyle> = {
  idle:     { bodyScale: 0.94, bodyOpacity: 0.35, eyes: { dx: 0, ry: 0.15, opacity: 0.6 } },
  working:  { bodyScale: 1,    bodyOpacity: 0.9,  eyes: { dx: 0, ry: 1,    opacity: 1 } },
  searching:{ bodyScale: 1,    bodyOpacity: 0.9,  eyes: { dx: 1.6, ry: 0.8, opacity: 1 } },
  asking:   { bodyScale: 1.03, bodyOpacity: 0.95, eyes: { dx: 0, ry: 1.55, opacity: 1 } },
  worried:  { bodyScale: 0.9,  bodyOpacity: 0.75, eyes: { dx: 0, ry: 0.45, opacity: 1 } },
  happy:    { bodyScale: 1.08, bodyOpacity: 1,    eyes: { dx: 0, ry: 1.1,  opacity: 1 } },
  settled:  { bodyScale: 1,    bodyOpacity: 0.65, eyes: { dx: 0, ry: 0.7,  opacity: 0.85 } },
};

const BLOB = "M9.5 1.2 C13.6 1.2 16.8 4.4 16.8 8.5 C16.8 12.6 13.6 15.8 9.5 15.8 C5.4 15.8 2.2 12.6 2.2 8.5 C2.2 4.4 5.4 1.2 9.5 1.2 Z";

export function CrewFace({ agent, mood }: { agent: AgentId; mood: CrewMood }) {
  const m = MOODS[mood];
  return (
    <span
      className="crew-face"
      role="img"
      aria-label={`${CREW[agent].name}: ${mood}`}
      title={`${CREW[agent].name} · ${mood}`}
      style={{ display: "inline-flex", transform: `scale(${m.bodyScale})`, opacity: m.bodyOpacity }}
    >
      <svg width="20" height="20" viewBox="0 0 19 17" aria-hidden="true">
        <path d={BLOB} fill={CREW[agent].color} />
        <g className="crew-eyes" style={{ transform: `translateX(${m.eyes.dx}px)` }}>
          <ellipse cx="6.7" cy="8" rx="1.15" ry={1.15 * m.eyes.ry} fill="var(--m-bg)" opacity={m.eyes.opacity} />
          <ellipse cx="12.3" cy="8" rx="1.15" ry={1.15 * m.eyes.ry} fill="var(--m-bg)" opacity={m.eyes.opacity} />
        </g>
      </svg>
    </span>
  );
}

export function CrewFaces({ events }: { events: CrewEvent[] }) {
  const moods = agentMoods(events);
  return (
    <span className="flex items-center gap-1.5" aria-label="crew status">
      {AGENT_IDS.map((id) => (
        <CrewFace key={id} agent={id} mood={moods[id]} />
      ))}
    </span>
  );
}
