"use client";

import { useEffect, useRef } from "react";
import { CREW } from "@/agents/crew";
import { AGENT_ICONS } from "@/lib/agent-icons";
import type { AgentId, Citation, EvalResult } from "@/domain/types";

export type LogEntry =
  | { kind: "agent"; agent: AgentId; title: string }
  | { kind: "text"; agent: AgentId; text: string }
  | { kind: "tool"; agent: AgentId; text: string }
  | { kind: "citation"; citation: Citation }
  | { kind: "eval"; result: EvalResult }
  | { kind: "locked"; label: string }
  | { kind: "move"; text: string }
  | { kind: "error"; text: string }
  | { kind: "system"; text: string };

const agentColor = (id: AgentId) => CREW[id]?.color ?? "var(--color-mist)";

export function CrewFeed({ entries, running }: { entries: LogEntry[]; running?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [entries.length]);

  return (
    <div
      ref={ref}
      role="log"
      aria-live="polite"
      aria-label="Crew activity feed"
      className="scroll-thin h-full overflow-y-auto pr-2 font-mono2 text-[12px] leading-relaxed"
    >
      {entries.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="text-[12px] text-paper">The crew is on standby.</div>
          <p className="max-w-xs text-[12px] leading-relaxed text-mist">
            Start the night shift and you&apos;ll see each agent think, research and check its work here, in order.
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[12px] text-dim">
            {(Object.keys(CREW) as AgentId[]).map((id) => {
              const Icon = AGENT_ICONS[id];
              return (
                <span key={id} className="inline-flex items-center gap-1">
                  <Icon size={11} style={{ color: agentColor(id) }} />
                  {CREW[id].name}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {entries.map((e, i) => {
        switch (e.kind) {
          case "agent": {
            const Icon = AGENT_ICONS[e.agent];
            return (
              <div key={i} className="mt-4 mb-1 flex items-center gap-2">
                <Icon size={12} style={{ color: agentColor(e.agent) }} />
                <span className="text-[12px] font-semibold" style={{ color: agentColor(e.agent) }}>
                  {e.title}
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>
            );
          }
          case "text": {
            // The tail of the feed reads in full: the agent's reasoning is the
            // product, not a tooltip. Everything above it stays clamped to two
            // lines so the feed still scans, and the typing cursor marks the
            // entry that is still being written.
            const isLiveEdge = running && i === entries.length - 1;
            const isTail = i === entries.length - 1;
            return (
              <p
                key={i}
                className={`mb-1 font-sans text-[13px] text-paper ${isTail ? "" : "line-clamp-2"}`}
                title={isTail ? undefined : e.text}
              >
                {e.text}
                {isLiveEdge && (
                  <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-mist align-middle opacity-40" />
                )}
              </p>
            );
          }
          case "tool":
            return (
              <div key={i} className="pl-4 text-mist">
                <span className="text-dim">├─</span> {e.text}
              </div>
            );
          case "citation":
            return (
              <div key={i} className="my-1 ml-4 rounded-md border border-line bg-ink-2 px-2.5 py-1.5">
                <div className="text-[12px] leading-snug text-paper">{e.citation.title}</div>
                <div className="text-[12px] text-mist">
                  {e.citation.venue}
                  {e.citation.year ? ` · ${e.citation.year}` : ""}
                  {e.citation.doi ? ` · doi:${e.citation.doi}` : ""}
                  {e.citation.source === "verified-fallback" ? " · verified fallback" : ""}
                </div>
              </div>
            );
          case "eval":
            return (
              <div
                key={i}
                className={`my-1.5 ml-4 rounded-md border px-2.5 py-1.5 ${
                  e.result.feasible
                    ? "border-pass/20 bg-pass/7 text-pass"
                    : "border-fail/27 bg-fail/7 text-fail"
                }`}
              >
                <div className="text-[12px] font-semibold">
                  {e.result.feasible ? `PASS · score ${e.result.score.toFixed(2)}` : "FAIL · plan rejected"}
                </div>
                {e.result.violations.slice(0, 2).map((v, j) => (
                  <div key={j} className="text-[12px] opacity-80">— {v.message}</div>
                ))}
                {e.result.feasible && e.result.notes.slice(0, 1).map((n, j) => (
                  <div key={j} className="text-[12px] opacity-70">note: {n}</div>
                ))}
              </div>
            );
          case "locked":
            return (
              <div key={i} className="my-1.5 rounded-md bg-pass/13 px-2.5 py-1 text-center text-[12px] font-bold text-pass">
                {e.label} LOCKED · sun advances
              </div>
            );
          case "move":
            return (
              <div key={i} className="pl-4 text-sun-home">
                <span className="text-dim">↳</span> {e.text}
              </div>
            );
          case "error":
            return (
              <div key={i} className="my-1.5 rounded-md border border-fail/27 bg-fail/7 px-2.5 py-1.5 text-[12px] text-fail">
                {e.text}
              </div>
            );
          case "system":
            return (
              <div key={i} className="py-0.5 text-center text-[12px] text-dim">
                {e.text}
              </div>
            );
        }
      })}
    </div>
  );
}
