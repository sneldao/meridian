"use client";

import { useEffect } from "react";

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

  const mins = Math.floor(elapsedMs / 60000);
  const secs = Math.floor((elapsedMs / 1000) % 60);

  return (
    <div className="flex h-full min-h-[360px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1e2637] bg-[#0c1018] p-2">
        <div className="flex flex-wrap gap-1">
          {LENSES.map((l) => (
            <button
              key={l.id}
              onClick={() => onChange(l.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                lens === l.id
                  ? "bg-[#b8e356] text-[#07090f]"
                  : "border border-[#1e2637] text-[#8b93a7] hover:border-[#8b93a7]"
              }`}
            >
              {l.key} · {l.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 font-mono2 text-[11px] text-[#8b93a7]">
          <span className={running ? "text-[#b8e356]" : ""}>
            {running ? "LIVE" : "IDLE"} · {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </span>
          <span>tools {toolCalls}</span>
          <span>locked {lockedDays}</span>
          <button
            onClick={onToggleAuto}
            className={`rounded-lg px-2 py-1 text-[10px] font-bold transition-colors ${
              auto ? "bg-[#1e2637] text-[#e8eaf2]" : "border border-[#1e2637] text-[#4a5470]"
            }`}
          >
            {auto ? "director on" : "director off"}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#1e2637] bg-[#0c1018]">
        {children}
      </div>
    </div>
  );
}