"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { CREW } from "@/agents/crew";
import { AGENT_ICONS } from "@/lib/agent-icons";
import type { AgentId } from "@/domain/types";
import { Card } from "./Card";
import { Button } from "./Button";

export interface AgentCardProps {
  id: AgentId;
  onClose: () => void;
}

export function AgentCard({ id, onClose }: AgentCardProps) {
  const agent = CREW[id];
  const Icon = AGENT_ICONS[id];
  const reduce = useReducedMotion();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={reduce ? undefined : { opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-sm"
      >
        <Card className="border-mist/20 p-5 shadow-2xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="absolute top-3 right-3 h-7 w-7 p-0"
            aria-label="Close agent card"
          >
            <X size={16} />
          </Button>

          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-ink"
              style={{ color: agent.color }}
            >
              <Icon size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-paper">{agent.name}</h3>
              <p className="text-xs text-mist">
                {agent.callsign} · {agent.title}
              </p>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-paper/90">
            {agent.blurb}
          </p>
        </Card>
      </motion.div>
    </div>
  );
}
