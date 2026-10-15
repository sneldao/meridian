"use client";

import { useEffect, useRef } from "react";
import { CREW } from "@/agents/crew";
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

const agentColor = (id: AgentId) => CREW[id]?.color ?? "#8b93a7";

export function CrewFeed({ entries }: { entries: LogEntry[] }) {
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
      {entries.map((e, i) => {
        switch (e.kind) {
          case "agent":
            return (
              <div key={i} className="mt-4 mb-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: agentColor(e.agent) }} />
                <span className="text-[11px] font-semibold tracking-wider" style={{ color: agentColor(e.agent) }}>
                  {e.title}
                </span>
                <span className="h-px flex-1 bg-[#1e2637]" />
              </div>
            );
          case "text":
            return (
              <p key={i} className="mb-1 text-[#e8eaf2]">
                {e.text}
                <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-[#8b93a7] align-middle opacity-40" />
              </p>
            );
          case "tool":
            return (
              <div key={i} className="pl-4 text-[#8b93a7]">
                <span className="text-[#4a5470]">├─</span> {e.text}
              </div>
            );
          case "citation":
            return (
              <div key={i} className="my-1 ml-4 rounded-md border border-[#1e2637] bg-[#0c1018] px-2.5 py-1.5">
                <div className="text-[#b8e356] text-[11px] leading-snug">{e.citation.title}</div>
                <div className="text-[10px] text-[#8b93a7]">
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
                    ? "border-[#b8e35633] bg-[#b8e35611] text-[#b8e356]"
                    : "border-[#ff7a7a44] bg-[#ff7a7a11] text-[#ff7a7a]"
                }`}
              >
                <div className="text-[11px] font-semibold">
                  {e.result.feasible ? `PASS · score ${e.result.score.toFixed(2)}` : "FAIL · plan rejected"}
                </div>
                {e.result.violations.slice(0, 2).map((v, j) => (
                  <div key={j} className="text-[10px] opacity-80">— {v.message}</div>
                ))}
                {e.result.feasible && e.result.notes.slice(0, 1).map((n, j) => (
                  <div key={j} className="text-[10px] opacity-70">note: {n}</div>
                ))}
              </div>
            );
          case "locked":
            return (
              <div key={i} className="my-1.5 rounded-md bg-[#b8e35622] px-2.5 py-1 text-center text-[11px] font-bold tracking-widest text-[#b8e356]">
                {e.label} LOCKED · sun advances
              </div>
            );
          case "move":
            return (
              <div key={i} className="pl-4 text-[#9db8ff]">
                <span className="text-[#4a5470]">↳</span> {e.text}
              </div>
            );
          case "error":
            return (
              <div key={i} className="my-1.5 rounded-md border border-[#ff7a7a44] bg-[#ff7a7a11] px-2.5 py-1.5 text-[11px] text-[#ff7a7a]">
                {e.text}
              </div>
            );
          case "system":
            return (
              <div key={i} className="py-0.5 text-center text-[10px] tracking-widest text-[#4a5470] uppercase">
                {e.text}
              </div>
            );
        }
      })}
    </div>
  );
}
