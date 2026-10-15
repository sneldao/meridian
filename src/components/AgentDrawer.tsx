"use client";

import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import { CREW } from "@/agents/crew";
import type { AgentId, CrewEvent } from "@/domain/types";
import { CrewFeed, type LogEntry } from "@/components/CrewFeed";
import { Ledger } from "@/components/lenses/Ledger";
import { AgentChip } from "@/components/ui/AgentChip";

interface AgentDrawerProps {
  open: boolean;
  onClose: () => void;
  entries: LogEntry[];
  events: CrewEvent[];
  running: boolean;
  activeAgent?: AgentId;
  toolCalls: number;
  lockedDays: number;
}

export function AgentDrawer({
  open,
  onClose,
  entries,
  events,
  running,
  activeAgent,
  toolCalls,
  lockedDays,
}: AgentDrawerProps) {
  const [tab, setTab] = useState<"feed" | "ledger">("feed");

  if (!open) return null;

  const activeCrew = activeAgent ? CREW[activeAgent] : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Behind the scenes AI crew activity"
    >
      <div
        className="flex h-full w-full max-w-lg flex-col border-l border-line bg-ink-2 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-sun-dest" />
              <h2 className="text-sm font-bold text-paper">
                Behind the Scenes · AI Crew Activity
              </h2>
              {running && (
                <span className="inline-flex items-center gap-1 rounded-full bg-progress/15 px-2 py-0.5 font-mono2 text-2xs font-semibold text-progress">
                  <span className="h-1.5 w-1.5 rounded-full bg-progress animate-pulse" />
                  LIVE
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-mist">
              {activeCrew
                ? `${activeCrew.name} (${activeCrew.callsign}) is ${activeCrew.title}…`
                : `5 specialists · ${toolCalls} tool checks · ${lockedDays} days verified`}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line bg-ink-3 p-1.5 text-mist transition-colors hover:text-paper"
            aria-label="Close behind the scenes drawer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Crew roster bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ink-3/50 px-5 py-2.5">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(CREW) as AgentId[]).map((id) => (
              <AgentChip
                key={id}
                id={id}
                className={activeAgent === id ? "border-paper bg-ink-3" : undefined}
              />
            ))}
          </div>

          <div className="inline-flex rounded-lg border border-line bg-ink-2 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTab("feed")}
              className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                tab === "feed" ? "bg-paper text-ink" : "text-mist hover:text-paper"
              }`}
            >
              Reasoning
            </button>
            <button
              type="button"
              onClick={() => setTab("ledger")}
              className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                tab === "ledger" ? "bg-paper text-ink" : "text-mist hover:text-paper"
              }`}
            >
              Event Ledger
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-hidden p-4">
          {tab === "feed" ? (
            <CrewFeed entries={entries} running={running} />
          ) : (
            <Ledger events={events} />
          )}
        </div>
      </div>
    </div>
  );
}
