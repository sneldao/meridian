"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CREW } from "@/agents/crew";
import { AGENT_ICONS } from "@/lib/agent-icons";
import { spokenChars, subscribeVoice } from "@/lib/voice/engine";
import type { AgentId, Citation, EvalResult } from "@/domain/types";
import { AgentChip } from "@/components/ui/AgentChip";
import { feedItemVariants, easeSmoothOut } from "@/lib/motion";

export type LogEntry =
  | { kind: "agent"; agent: AgentId; title: string }
  | { kind: "text"; agent: AgentId; text: string; uId?: string; uStart?: number }
  | { kind: "tool"; agent: AgentId; text: string }
  | { kind: "citation"; citation: Citation }
  | { kind: "eval"; result: EvalResult }
  | { kind: "locked"; label: string }
  | { kind: "move"; text: string }
  | { kind: "error"; text: string }
  | { kind: "system"; text: string };

const agentColor = (id: AgentId) => CREW[id]?.color ?? "var(--color-mist)";

// The tail of the feed reads in full: the agent's reasoning is the product,
// not a tooltip. Everything above it stays clamped to two lines so the feed
// still scans, and the typing cursor marks the entry that is still being
// written. When voice is speaking this entry, the already-spoken prefix lights
// up in the agent's colour — karaoke sync from ElevenLabs char alignment.
function TextLine({ e, isTail, isLiveEdge }: { e: Extract<LogEntry, { kind: "text" }>; isTail: boolean; isLiveEdge?: boolean }) {
  const spoken = useSyncExternalStore(
    subscribeVoice,
    () => spokenChars(e.uId),
    () => 0,
  );
  const n = e.uId ? Math.max(0, Math.min(e.text.length, spoken - (e.uStart ?? 0))) : 0;
  return (
    <p
      className={`mb-1 font-sans text-sm text-paper ${isTail ? "" : "line-clamp-2"}`}
      title={isTail ? undefined : e.text}
    >
      {n > 0 && <span style={{ color: agentColor(e.agent) }}>{e.text.slice(0, n)}</span>}
      {e.text.slice(n)}
      {isLiveEdge && (
        <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-mist align-middle opacity-40" />
      )}
    </p>
  );
}

export function CrewFeed({ entries, running }: { entries: LogEntry[]; running?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [entries.length]);

  return (
    <div
      ref={ref}
      role="log"
      aria-live="polite"
      aria-label="Crew activity feed"
      className="scroll-thin h-full overflow-y-auto pr-2 font-mono2 text-xs leading-relaxed"
    >
      {entries.length === 0 && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: easeSmoothOut }}
          className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
        >
          <div className="text-sm font-bold text-paper">The crew is on standby.</div>
          <p className="max-w-xs text-xs leading-relaxed text-mist">
            Start the night shift and you&apos;ll see each agent think, research and check its work here, in order.
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-2 text-xs text-dim">
            {(Object.keys(CREW) as AgentId[]).map((id) => (
              <AgentChip key={id} id={id} />
            ))}
          </div>
        </motion.div>
      )}
      {entries.map((e, i) => {
        const isLiveEdge = running && i === entries.length - 1;
        const isTail = i === entries.length - 1;
        const content = (() => {
          switch (e.kind) {
            case "agent": {
              const Icon = AGENT_ICONS[e.agent];
              return (
                <div className="mt-4 mb-1 flex items-center gap-2">
                  <Icon size={12} style={{ color: agentColor(e.agent) }} />
                  <span className="text-xs font-semibold" style={{ color: agentColor(e.agent) }}>
                    {e.title}
                  </span>
                  <span className="h-px flex-1 bg-line" />
                </div>
              );
            }
            case "text":
              return <TextLine e={e} isTail={isTail} isLiveEdge={isLiveEdge} />;
            case "tool":
              return (
                <div className="pl-4 text-mist">
                  <span className="text-dim">├─</span> {e.text}
                </div>
              );
            case "citation":
              return (
                <div className="my-1 ml-4 rounded-md border border-line bg-ink-2 px-2.5 py-1.5">
                  <div className="text-xs leading-snug text-paper">{e.citation.title}</div>
                  <div className="text-xs text-mist">
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
                  className={`my-1.5 ml-4 rounded-md border px-2.5 py-1.5 ${
                    e.result.feasible
                      ? "border-pass/20 bg-pass/10 text-pass"
                      : "border-fail/20 bg-fail/10 text-fail"
                  }`}
                >
                  <div className="text-xs font-semibold">
                    {e.result.feasible ? `PASS · score ${e.result.score.toFixed(2)}` : "FAIL · plan rejected"}
                  </div>
                  {e.result.violations.slice(0, 2).map((v, j) => (
                    <div key={j} className="text-xs opacity-80">— {v.message}</div>
                  ))}
                  {e.result.feasible && e.result.notes.slice(0, 1).map((n, j) => (
                    <div key={j} className="text-xs opacity-70">note: {n}</div>
                  ))}
                </div>
              );
            case "locked":
              return (
                <div className="my-1.5 rounded-md bg-pass/10 px-2.5 py-1 text-center text-xs font-bold text-pass">
                  {e.label} LOCKED · sun advances
                </div>
              );
            case "move":
              return (
                <div className="pl-4 text-sun-home">
                  <span className="text-dim">↳</span> {e.text}
                </div>
              );
            case "error":
              return (
                <div className="my-1.5 rounded-md border border-fail/20 bg-fail/10 px-2.5 py-1.5 text-xs text-fail">
                  {e.text}
                </div>
              );
            case "system":
              return (
                <div className="py-0.5 text-center text-xs text-dim">
                  {e.text}
                </div>
              );
          }
        })();

        return (
          <motion.div
            key={i}
            variants={feedItemVariants}
            initial={reduce ? false : "hidden"}
            animate="visible"
            transition={{ duration: reduce ? 0 : 0.2, ease: easeSmoothOut }}
          >
            {content}
          </motion.div>
        );
      })}
    </div>
  );
}
