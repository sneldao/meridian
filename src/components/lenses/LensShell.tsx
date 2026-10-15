"use client";

import { useEffect, useState } from "react";

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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-ink-2 p-2">
        <div className="flex flex-wrap gap-1">
          {LENSES.map((l) => (
            <button
              key={l.id}
              onClick={() => onChange(l.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                lens === l.id
                  ? "bg-paper text-ink"
                  : "border border-line text-mist hover:border-mist"
              }`}
            >
              {l.key} · {l.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 font-mono2 text-[12px] text-mist">
          <span className={running ? "text-progress" : ""}>
            {running ? "LIVE" : "IDLE"} · {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </span>
          <span>tools {toolCalls}</span>
          <span>locked {lockedDays}</span>
          <button
            onClick={onToggleAuto}
            className={`rounded-lg px-2 py-1 text-[12px] font-bold transition-colors ${
              auto ? "bg-line text-paper" : "border border-line text-dim"
            }`}
          >
            {auto ? "director on" : "director off"}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-ink-2">
        {children}
      </div>
    </div>
  );
}