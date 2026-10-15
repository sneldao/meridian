"use client";

import { CREW } from "@/agents/crew";
import { AGENT_ICONS } from "@/lib/agent-icons";
import { fmtMin } from "@/domain/circadian";
import type { AgentId, CrewEvent } from "@/domain/types";

// Prove it. Every event the run streamed, in order, with the counts a judge
// asks for first: tool calls, planning attempts, rejections and locked days.
// Dense by design — the glyph + tinted payload make milestones scannable
// without turning the log into prose.

export interface LedgerProps {
  events: CrewEvent[];
}

interface Row {
  who: string;
  agent?: AgentId;
  what: string;
  tone: string;
  /** Milestone rows tint their payload so verdicts/locks pop while scanning. */
  emph?: boolean;
}

function describe(e: CrewEvent): Row {
  switch (e.type) {
    case "run_start":
      return { who: "system", what: `shift ${e.trip.origin.code} → ${e.trip.destination.code}`, tone: "#8b93a7" };
    case "agent_start":
      return { who: CREW[e.agent].name, agent: e.agent, what: `starts · ${e.title}`, tone: CREW[e.agent].color };
    case "agent_end":
      return { who: CREW[e.agent].name, agent: e.agent, what: "done", tone: CREW[e.agent].color };
    case "agent_token":
      return { who: CREW[e.agent].name, agent: e.agent, what: e.text, tone: CREW[e.agent].color };
    case "tool_call":
      return { who: CREW[e.agent].name, agent: e.agent, what: `→ ${e.tool} ${e.detail}`.trim(), tone: "#8b93a7" };
    case "tool_result":
      return { who: CREW[e.agent].name, agent: e.agent, what: `← ${e.tool}: ${e.detail}`, tone: "#8b93a7" };
    case "citation":
      return { who: CREW[e.agent].name, agent: e.agent, what: `cites ${e.citation.title}`, tone: "#b8e356" };
    case "plan_candidate":
      return { who: "planner", agent: "planner", what: `draft ${e.day.label} · ${e.day.shiftMin}min`, tone: "#ffc46b" };
    case "eval_result":
      return {
        who: "evaluator",
        agent: "evaluator",
        what: e.result.feasible
          ? `PASS ${e.result.score.toFixed(2)} (attempt ${e.attempt})`
          : `FAIL ${e.result.violations[0]?.code ?? ""} (attempt ${e.attempt})`,
        tone: e.result.feasible ? "#b8e356" : "#ff7a7a",
        emph: true,
      };
    case "day_locked":
      return { who: "evaluator", agent: "evaluator", what: `${e.day.label} locked · bed ${fmtMin(e.day.targetBedtimeMin)}`, tone: "#b8e356", emph: true };
    case "calendar_move":
      return { who: "negotiator", agent: "negotiator", what: `${e.move.title}: ${fmtMin(e.move.from.startMin)} → ${fmtMin(e.move.to.startMin)}`, tone: "#9db8ff" };
    case "check_in":
      return { who: "wearer", what: `reported ${e.checkIn.status}${e.checkIn.text ? ` — ${e.checkIn.text}` : ""}`, tone: "#ffc46b" };
    case "replan":
      return { who: "system", what: `replan · drops ${e.droppedDays.length} day(s)`, tone: "#ffc46b", emph: true };
    case "briefing":
      return { who: "system", what: `briefing · score ${e.score.toFixed(2)}`, tone: "#b8e356", emph: true };
    case "error":
      return { who: "system", what: e.message, tone: "#ff7a7a", emph: true };
    case "done":
      return { who: "system", what: "done", tone: "#8b93a7" };
  }
}

export function Ledger({ events }: LedgerProps) {
  const count = (t: CrewEvent["type"]) => events.filter((e) => e.type === t).length;
  const toolCalls = count("tool_call");
  const attempts = count("eval_result");
  const rejections = events.filter((e) => e.type === "eval_result" && !e.result.feasible).length;
  const locks = count("day_locked");

  return (
    <div className="flex h-full w-full flex-col gap-3 p-4 font-mono2 text-[11px] text-[#e8eaf2]">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="text-[10px] tracking-widest text-[#8b93a7] uppercase">ledger</span>
        <Stat label="events" value={events.length} />
        <Stat label="tool calls" value={toolCalls} />
        <Stat label="attempts" value={attempts} />
        <Stat label="rejected" value={rejections} tone="#ff7a7a" />
        <Stat label="locked" value={locks} tone="#b8e356" />
      </div>

      <ol className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-2">
        {events.map((e, i) => {
          const d = describe(e);
          const Icon = d.agent ? AGENT_ICONS[d.agent] : null;
          return (
            <li key={i} className="grid grid-cols-[32px_96px_1fr] gap-2 border-b border-[#1e263722] py-0.5">
              <span className="text-[#4a5470]">{String(i + 1).padStart(3, "0")}</span>
              <span className="flex items-center gap-1.5 truncate font-bold" style={{ color: d.tone }}>
                {d.agent && Icon && (
                  <Icon size={10} className="shrink-0" style={{ color: CREW[d.agent].color }} />
                )}
                {d.who}
              </span>
              <span className="break-words text-[#e8eaf2]" style={d.emph ? { color: d.tone } : undefined}>
                {d.what}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <span className="text-[10px] tracking-widest text-[#8b93a7] uppercase">
      {label} <span className="ml-1 text-[12px] font-bold" style={{ color: tone ?? "#e8eaf2" }}>{value}</span>
    </span>
  );
}
