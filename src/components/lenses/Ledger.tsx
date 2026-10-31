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
      return { who: "system", what: `shift ${e.trip.origin.code} → ${e.trip.destination.code}`, tone: "var(--color-mist)" };
    case "agent_start":
      return { who: CREW[e.agent].name, agent: e.agent, what: `starts · ${e.title}`, tone: CREW[e.agent].color };
    case "agent_end":
      return { who: CREW[e.agent].name, agent: e.agent, what: "done", tone: CREW[e.agent].color };
    case "agent_token":
      return { who: CREW[e.agent].name, agent: e.agent, what: e.text, tone: CREW[e.agent].color };
    case "tool_call":
      return { who: CREW[e.agent].name, agent: e.agent, what: `→ ${e.tool} ${e.detail}`.trim(), tone: "var(--color-mist)" };
    case "tool_result":
      return { who: CREW[e.agent].name, agent: e.agent, what: `← ${e.tool}: ${e.detail}`, tone: "var(--color-mist)" };
    case "citation":
      return { who: CREW[e.agent].name, agent: e.agent, what: `cites ${e.citation.title}`, tone: "var(--color-pass)" };
    case "plan_candidate":
      return { who: "planner", agent: "planner", what: `draft ${e.day.label} · ${e.day.shiftMin}min`, tone: "var(--color-sun-dest)" };
    case "eval_result":
      return {
        who: "evaluator",
        agent: "evaluator",
        what: e.result.feasible
          ? `PASS ${e.result.score.toFixed(2)} (attempt ${e.attempt})`
          : `FAIL ${e.result.violations[0]?.code ?? ""} (attempt ${e.attempt})`,
        tone: e.result.feasible ? "var(--color-pass)" : "var(--color-fail)",
        emph: true,
      };
    case "day_locked":
      return { who: "evaluator", agent: "evaluator", what: `${e.day.label} locked · bed ${fmtMin(e.day.targetBedtimeMin)}`, tone: "var(--color-pass)", emph: true };
    case "calendar_move":
      return { who: "negotiator", agent: "negotiator", what: `proposed ${e.move.title}: ${fmtMin(e.move.from.startMin)} → ${fmtMin(e.move.to.startMin)}`, tone: "var(--color-sun-home)" };
    case "approval_request":
      return { who: "system", what: e.approval.summary, tone: "var(--color-sun-dest)", emph: true };
    case "approval_result":
      return {
        who: "system",
        what: e.message,
        tone: e.status === "applied" ? "var(--color-pass)" : e.status === "rejected" ? "var(--color-sun-dest)" : "var(--color-fail)",
        emph: true,
      };
    case "calendar_restore":
      return { who: "system", what: "calendar restored to its original times", tone: "var(--color-mist)" };
    case "check_in":
      return { who: "wearer", what: `reported ${e.checkIn.status}${e.checkIn.text ? ` — ${e.checkIn.text}` : ""}`, tone: "var(--color-sun-dest)" };
    case "replan":
      return { who: "system", what: `replan · drops ${e.droppedDays.length} day(s)`, tone: "var(--color-sun-dest)", emph: true };
    case "briefing":
      return { who: "system", what: `briefing · score ${e.score.toFixed(2)}`, tone: "var(--color-pass)", emph: true };
    case "error":
      return { who: "system", what: e.message, tone: "var(--color-fail)", emph: true };
    case "done":
      return { who: "system", what: "done", tone: "var(--color-mist)" };
  }
}

export function Ledger({ events }: LedgerProps) {
  const count = (t: CrewEvent["type"]) => events.filter((e) => e.type === t).length;
  const toolCalls = count("tool_call");
  const attempts = count("eval_result");
  const rejections = events.filter((e) => e.type === "eval_result" && !e.result.feasible).length;
  const locks = count("day_locked");

  return (
    <div className="flex h-full w-full flex-col gap-3 p-4 font-mono2 text-xs text-paper">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span className="text-xs text-mist">ledger</span>
        <Stat label="events" value={events.length} />
        <Stat label="tool calls" value={toolCalls} />
        <Stat label="attempts" value={attempts} />
        <Stat label="rejected" value={rejections} tone="var(--color-fail)" />
        <Stat label="locked" value={locks} tone="var(--color-pass)" />
      </div>

      <ol className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-2">
        {events.map((e, i) => {
          const d = describe(e);
          const Icon = d.agent ? AGENT_ICONS[d.agent] : null;
          return (
            <li key={i} className="grid grid-cols-[40px_104px_1fr] gap-2 border-b border-line/10 py-0.5">
              <span className="text-dim">{String(i + 1).padStart(3, "0")}</span>
              <span className="flex items-center gap-1.5 truncate font-bold" style={{ color: d.tone }}>
                {d.agent && Icon && (
                  <Icon size={12} className="shrink-0" style={{ color: CREW[d.agent].color }} />
                )}
                {d.who}
              </span>
              <span className="break-words text-paper" style={d.emph ? { color: d.tone } : undefined}>
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
    <span className="text-xs text-mist">
      {label} <span className="ml-1 text-xs font-bold" style={{ color: tone ?? "var(--color-paper)" }}>{value}</span>
    </span>
  );
}
