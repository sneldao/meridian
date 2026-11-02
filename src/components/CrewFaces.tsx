"use client";

import { useEffect, useRef, useState } from "react";
import { CREW } from "@/agents/crew";
import type { AgentId, CrewEvent } from "@/domain/types";

/* The crew has a face — and a shape. open-bot-avatar's lesson: an avatar
 * is data, not a component — one path plus where the eyes sit. Each agent
 * gets its own silhouette (AVATAR_DEFS), its colour from CREW, its mood
 * folded from the event stream (agentMoods), and eyes that follow the
 * pointer — grokbot's ambient channel. What you see is what the run did. */

export type CrewMood =
  | "idle"      // not started yet — eyes shut, body dim
  | "working"   // streaming/drafting — eyes open, alert
  | "searching" // a tool call in flight — eyes look sideways
  | "asking"    // a crew_question is open — eyes wide
  | "worried"   // last verdict failed — eyes drop, body shrinks
  | "happy"     // a pass or a lock landed — body swells, eyes brighten
  | "settled";  // work done — calm eyes

export const AGENT_IDS: AgentId[] = ["analyst", "researcher", "planner", "evaluator", "negotiator"];

/** The avatar contract: one path in a 0 0 19 17 box, and where the eyes sit. */
export const AVATAR_DEFS: Record<AgentId, { path: string; eyes: { x1: number; x2: number; y: number } }> = {
  // Mara — the round analyst
  analyst: { path: "M9.5 1.2 C13.6 1.2 16.8 4.4 16.8 8.5 C16.8 12.6 13.6 15.8 9.5 15.8 C5.4 15.8 2.2 12.6 2.2 8.5 C2.2 4.4 5.4 1.2 9.5 1.2 Z", eyes: { x1: 6.7, x2: 12.3, y: 8 } },
  // Jun — the squared-off researcher
  researcher: { path: "M4 2.5 H15 C16.2 2.5 16.8 3.4 16.8 4.6 V12.4 C16.8 13.6 16.2 14.5 15 14.5 H4 C2.8 14.5 2.2 13.6 2.2 12.4 V4.6 C2.2 3.4 2.8 2.5 4 2.5 Z", eyes: { x1: 6.9, x2: 12.1, y: 8 } },
  // Otto — the wide, grounded planner
  planner: { path: "M2.8 9.5 C2.8 5.5 5.8 2.5 9.5 2.5 C13.2 2.5 16.2 5.5 16.2 9.5 C16.2 13 13.8 14.6 9.5 14.6 C5.2 14.6 2.8 13 2.8 9.5 Z", eyes: { x1: 6.7, x2: 12.3, y: 8.6 } },
  // Iris — the shield-shaped evaluator
  evaluator: { path: "M9.5 1.5 C11.5 3 14 3.6 16 3.2 C16.4 8 14.6 13 9.5 15.5 C4.4 13 2.6 8 3 3.2 C5 3.6 7.5 3 9.5 1.5 Z", eyes: { x1: 6.9, x2: 12.1, y: 7.4 } },
  // Rex — the leaning negotiator
  negotiator: { path: "M4.5 1.8 C10 1 15.5 4 16.2 9 C16.9 14 11.5 16.5 6.5 15.2 C1.5 13.9 2.5 8.5 4.5 1.8 Z", eyes: { x1: 6.9, x2: 12.3, y: 8.2 } },
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

/** Eyes lean toward the pointer — the grokbot channel. Full lean at ~120px;
 *  stands down under reduced-motion and on the server. */
function useEyeFollow(ref: React.RefObject<HTMLSpanElement | null>): { x: number; y: number } {
  const [off, setOff] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const m = Math.min(1, d / 120);
      setOff({ x: (dx / d) * m * 1.6, y: (dy / d) * m * 1.1 });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [ref]);
  return off;
}

export function CrewFace({ agent, mood, follow = true }: { agent: AgentId; mood: CrewMood; follow?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const off = useEyeFollow(ref);
  const m = MOODS[mood];
  const def = AVATAR_DEFS[agent];
  const eyeX = m.eyes.dx + (follow ? off.x : 0);
  const eyeY = follow ? off.y : 0;
  return (
    <span
      ref={ref}
      className="crew-face"
      role="img"
      aria-label={`${CREW[agent].name}: ${mood}`}
      title={`${CREW[agent].name} · ${mood}`}
      style={{ display: "inline-flex", transform: `scale(${m.bodyScale})`, opacity: m.bodyOpacity }}
    >
      <svg width="20" height="20" viewBox="0 0 19 17" aria-hidden="true">
        <path d={def.path} fill={CREW[agent].color} />
        <g className="crew-eyes" style={{ transform: `translate(${eyeX}px, ${eyeY}px)` }}>
          <ellipse cx={def.eyes.x1} cy={def.eyes.y} rx="1.15" ry={1.15 * m.eyes.ry} fill="var(--m-bg)" opacity={m.eyes.opacity} />
          <ellipse cx={def.eyes.x2} cy={def.eyes.y} rx="1.15" ry={1.15 * m.eyes.ry} fill="var(--m-bg)" opacity={m.eyes.opacity} />
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
