"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { KeyHint } from "@/components/ui/KeyHint";
import { lensSwitchVariants, easeSmoothOut } from "@/lib/motion";

export type LensId = "world" | "board" | "calendar" | "ledger";

const LENSES: { id: LensId; label: string; key: string }[] = [
  { id: "world", label: "World", key: "1" },
  { id: "board", label: "Shift Board", key: "2" },
  { id: "calendar", label: "Calendar", key: "3" },
  { id: "ledger", label: "Ledger", key: "4" },
];

interface Props {
  lens: LensId;
  onChange: (lens: LensId) => void;
  auto: boolean;
  onToggleAuto: () => void;
  running: boolean;
  elapsedMs: number;
  toolCalls: number;
  lockedDays: number;
  children: React.ReactNode;
}

export function LensShell({
  lens,
  onChange,
  auto,
  onToggleAuto,
  running,
  elapsedMs,
  toolCalls,
  lockedDays,
  children,
}: Props) {
  const reduce = useReducedMotion();

  // The director drives `lens` in page.tsx by deriving it from run.focus.
  // It must NOT go through onChange — manual selection disables auto mode.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "1") onChange("world");
      else if (e.key === "2") onChange("board");
      else if (e.key === "3") onChange("calendar");
      else if (e.key === "4") onChange("ledger");
      else if (e.key === "a" || e.key === "A") onToggleAuto();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onChange, onToggleAuto]);

  // The clock must keep breathing between events: elapsedMs is stamped on the
  // latest event, so a ticking display anchors to it and lets wall time carry
  // the seconds forward. shownMs re-anchors the instant a new event lands
  // (render-adjust), and the interval drifts it between them.
  const [shownMs, setShownMs] = useState(elapsedMs);
  const [prevElapsed, setPrevElapsed] = useState(elapsedMs);
  if (prevElapsed !== elapsedMs) {
    setPrevElapsed(elapsedMs);
    setShownMs(elapsedMs);
  }
  useEffect(() => {
    if (!running) return;
    const base = elapsedMs;
    const anchoredAt = Date.now();
    const t = setInterval(() => setShownMs(base + (Date.now() - anchoredAt)), 1000);
    return () => clearInterval(t);
  }, [running, elapsedMs]);

  const ms = running ? shownMs : elapsedMs;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms / 1000) % 60);

  return (
    <div className="flex h-full min-h-[360px] flex-col gap-3">
      <Card className="flex flex-wrap items-center justify-between gap-2 p-2">
        <div className="flex flex-wrap gap-1">
          {LENSES.map((l) => (
            <Button
              key={l.id}
              variant={lens === l.id ? "primary" : "ghost"}
              size="sm"
              onClick={() => onChange(l.id)}
              aria-pressed={lens === l.id}
            >
              <KeyHint>{l.key}</KeyHint>
              {l.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {running && (
            <div className="flex items-center gap-3 font-mono2 text-xs text-mist">
              <span className="inline-flex items-center gap-1.5 text-progress">
                <span className="h-1.5 w-1.5 rounded-full bg-progress animate-pulse" />
                LIVE
              </span>
              <span>
                {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
              </span>
              <span>tools {toolCalls}</span>
              <span>locked {lockedDays}</span>
            </div>
          )}

          <Button
            variant={auto ? "secondary" : "ghost"}
            size="sm"
            onClick={onToggleAuto}
            title="Toggle auto-director (A)"
          >
            {auto ? "director on" : "director off"}
          </Button>
        </div>
      </Card>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-ink-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={lens}
            variants={lensSwitchVariants}
            initial={reduce ? false : "initial"}
            animate="animate"
            exit={reduce ? undefined : "exit"}
            transition={{ duration: reduce ? 0 : 0.25, ease: easeSmoothOut }}
            className="h-full w-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
