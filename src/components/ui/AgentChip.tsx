"use client";

import { useState } from "react";
import { CREW } from "@/agents/crew";
import { AGENT_ICONS } from "@/lib/agent-icons";
import type { AgentId } from "@/domain/types";
import { cn } from "@/lib/cn";
import { AgentCard } from "./AgentCard";

export interface AgentChipProps {
  id: AgentId;
  className?: string;
}

export function AgentChip({ id, className }: AgentChipProps) {
  const [open, setOpen] = useState(false);
  const agent = CREW[id];
  const Icon = AGENT_ICONS[id];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-full border border-line bg-ink-2 px-2.5 py-1 text-xs font-semibold text-paper transition-all duration-fast ease-smooth-out",
          "hover:border-mist hover:bg-ink-3",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sun-dest focus-visible:ring-offset-2 focus-visible:ring-offset-ink",
          className,
        )}
      >
        <Icon size={14} style={{ color: agent.color }} />
        <span>{agent.name}</span>
      </button>
      {open && <AgentCard id={id} onClose={() => setOpen(false)} />}
    </>
  );
}
