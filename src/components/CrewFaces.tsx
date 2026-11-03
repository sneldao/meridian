"use client";

import { useEffect, useRef, useState } from "react";
import { CREW } from "@/agents/crew";
import { CrewAvatar, type CrewAvatarState } from "@/components/CrewAvatar";
import type { AgentId, CrewEvent } from "@/domain/types";

/* The crew's live state channel — bloub's mood layer on top of round 31's
 * celestial glyphs. agentMoods folds the event stream into a mood per
 * agent and maps it onto CrewAvatar's state vocabulary; the eyes lean
 * toward the pointer through the avatar's existing gaze channel. What
 * the faces report is what the run did — never a performance beside it. */

export type CrewMood =
  | "idle"      // not started yet
  | "working"   // streaming/drafting
  | "searching" // a tool call in flight
  | "asking"    // a crew_question is open
  | "worried"   // last verdict failed
  | "happy"     // a pass or a lock landed
  | "settled";  // work done

export const AGENT_IDS: AgentId[] = ["analyst", "researcher", "planner", "evaluator", "negotiator"];

const MOOD_STATE: Record<CrewMood, CrewAvatarState> = {
  idle: "resting",
  working: "working",
  searching: "attentive",
  asking: "explaining",
  worried: "concerned",
  happy: "complete",
  settled: "complete",
};

export function agentMoods(events: CrewEvent[]): Record<AgentId, CrewMood> {
  const moods = Object.fromEntries(AGENT_IDS.map((id) => [id, "idle" as CrewMood])) as Record<AgentId, CrewMood>;
  for (const e of events) {
    switch (e.type) {
      case "agent_start":
      case "agent_token":
        /* Iris narrates her own verdict, so `eval_result` always lands one
         * event before her `agent_start` — and the start would overwrite the
         * verdict in the same tick, before it could ever paint (the fail cue
         * was written but never seen, in replay and live alike). A verdict
         * holds its face until the next verdict, or until the agent settles. */
        if (
          e.agent === "evaluator" &&
          (moods.evaluator === "worried" || moods.evaluator === "happy")
        ) {
          break;
        }
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

/** Eyes lean toward the pointer via the avatar's gaze channel (-1..1).
 *  Stands down under reduced-motion and on the server. */
function useGaze(ref: React.RefObject<HTMLSpanElement | null>): number {
  const [gaze, setGaze] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      setGaze(Math.max(-1, Math.min(1, dx / 120)));
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [ref]);
  return gaze;
}

export function CrewFace({ agent, mood, follow = true }: { agent: AgentId; mood: CrewMood; follow?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const gaze = useGaze(ref);
  return (
    <span
      ref={ref}
      className="crew-face"
      role="img"
      aria-label={`${CREW[agent].name}: ${mood}`}
      title={`${CREW[agent].name} · ${mood}`}
      style={{ display: "inline-flex" }}
    >
      <CrewAvatar id={agent} state={MOOD_STATE[mood]} size={20} gaze={follow ? gaze : 0} decorative />
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
