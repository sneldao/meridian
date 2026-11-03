"use client";

import { useEffect, useRef, useState } from "react";
import { CREW } from "@/agents/crew";
import { CrewAvatar, type CrewAvatarState } from "@/components/CrewAvatar";
import { CUE_HOLD_MS } from "@/domain/motion-cues";
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

export interface CrewVerdict {
  /** The verdict's own event — identity is the only reliable "this is a new
   *  verdict" mark, and a fresh run brings fresh event objects. */
  event: CrewEvent;
  mood: "happy" | "worried";
}

/** The newest verdict in the stream, whatever the narration around it says. */
export function lastVerdict(events: CrewEvent[]): CrewVerdict | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "eval_result") {
      return { event: e, mood: e.result.feasible ? "happy" : "worried" };
    }
    if (e.type === "day_locked") return { event: e, mood: "happy" };
  }
  return null;
}

/** Iris narrates her own verdict, so `eval_result` lands one event before her
 *  `agent_start` and the start would overwrite the verdict in the same tick —
 *  the fail cue was written but never painted. A verdict therefore keeps her
 *  face for one card beat (`CUE_HOLD_MS`, the window that holds a finished
 *  step), then the narration takes it back. The beat is given on the commit
 *  the verdict arrives in and ends on a timer, never on the next event. */
function useVerdictHold(events: CrewEvent[]): CrewMood | null {
  const verdict = lastVerdict(events);
  const event = verdict?.event ?? null;
  const [expired, setExpired] = useState<CrewEvent | null>(null);
  useEffect(() => {
    if (!event) return;
    const t = setTimeout(() => setExpired(event), CUE_HOLD_MS);
    return () => clearTimeout(t);
  }, [event]);
  return verdict && verdict.event !== expired ? verdict.mood : null;
}

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
  const verdict = useVerdictHold(events);
  return (
    <span className="flex items-center gap-1.5" aria-label="crew status">
      {AGENT_IDS.map((id) => (
        <CrewFace
          key={id}
          agent={id}
          mood={id === "evaluator" && verdict ? verdict : moods[id]}
        />
      ))}
    </span>
  );
}
