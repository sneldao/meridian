"use client";

// Hold to confirm.
//
// Some of the decisions on the clock are trades, not taps: handing over the
// 15:30 school pickup buys an hour of sleep and costs the pickup. A single
// stray tap should not make that decision, so the control asks to be held.
//
// It is still a button: it takes focus, it works from the keyboard (hold
// Space or Enter), and it announces what it is doing. The hold is 700ms —
// long enough to be deliberate, short enough not to be a chore.

import { useCallback, useEffect, useRef, useState } from "react";

export interface HoldToConfirmProps {
  label: string;
  /** What the hold buys, said while the hold is running. */
  holdingLabel?: string;
  onConfirm: () => void;
  /** Milliseconds the press must be held. */
  holdMs?: number;
  pressed?: boolean;
  className?: string;
}

export function HoldToConfirm({
  label,
  holdingLabel = "Keep holding…",
  onConfirm,
  holdMs = 700,
  pressed,
  className = "dial-btn",
}: HoldToConfirmProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef<number | null>(null);
  const fired = useRef(false);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    started.current = null;
    setHolding(false);
    setProgress(0);
  }, []);

  const begin = useCallback(() => {
    if (fired.current) return;
    fired.current = true;
    setHolding(true);
    started.current = Date.now();
    timer.current = setInterval(() => {
      const t = started.current ?? Date.now();
      const pct = Math.min(1, (Date.now() - t) / holdMs);
      setProgress(pct);
      if (pct >= 1) {
        stop();
        onConfirm();
        fired.current = false;
      }
    }, 40);
  }, [holdMs, onConfirm, stop]);

  useEffect(() => stop, [stop]);

  const cancel = useCallback(() => {
    stop();
    fired.current = false;
  }, [stop]);

  return (
    <button
      type="button"
      className={className}
      aria-pressed={pressed}
      onPointerDown={begin}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) begin();
      }}
      onKeyUp={cancel}
      onBlur={cancel}
      style={holding ? { borderColor: "var(--m-accent)" } : undefined}
    >
      {holding ? `${holdingLabel} ${Math.round(progress * 100)}%` : label}
    </button>
  );
}
