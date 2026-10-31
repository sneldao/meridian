"use client";

import { useState } from "react";
import type { LogEntry } from "@/components/CrewFeed";

const RECENT = 4;

function describe(e: LogEntry): string | null {
  switch (e.kind) {
    case "agent":
      return e.title;
    case "text":
      return e.text;
    case "tool":
      return e.text;
    case "locked":
      return `Locked ${e.label}`;
    case "move":
      return e.text;
    case "error":
      return e.text;
    case "system":
      return e.text;
    default:
      return null;
  }
}

/**
 * Settled crew trace. While the run is working it shows the newest few steps
 * inline. When the run settles it collapses to one line that expands on tap.
 * The one-line form is the record; the rows are the detail.
 */
export function CrewTrace({
  entries,
  running,
  lockedDays,
}: {
  entries: LogEntry[];
  running: boolean;
  lockedDays: number;
}) {
  const [open, setOpen] = useState(false);
  // Collapse during render when a run starts, instead of in an effect. Storing
  // the previous value and comparing it keeps this to one extra render, and
  // React re-runs the render with the reset state before committing.
  const [wasRunning, setWasRunning] = useState(running);
  if (wasRunning !== running) {
    setWasRunning(running);
    if (running) setOpen(false);
  }
  const steps = entries.map(describe).filter((s): s is string => !!s);
  if (steps.length === 0) return null;

  if (running || open) {
    const shown = open ? steps : steps.slice(-RECENT);
    return (
      <div className="font-mono2 text-xs text-mist">
        <p className="mb-1 flex items-center gap-2">
          {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-progress" />}
          <span>{running ? "Crew working" : "Crew finished"}</span>
          {!running && (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(false)}
              className="ml-auto text-dim hover:text-paper"
            >
              Hide trace
            </button>
          )}
        </p>
        <ol className="space-y-0.5">
          {shown.map((s, i) => (
            <li key={`${i}-${s.slice(0, 24)}`} className="truncate">
              {s}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-expanded={false}
      onClick={() => setOpen(true)}
      className="font-mono2 text-xs text-mist hover:text-paper"
    >
      Crew finished · {lockedDays} {lockedDays === 1 ? "day" : "days"} locked · {steps.length} steps
    </button>
  );
}
