"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";

/** "Done — Undo" in a bottom pill for 5s. A second show() replaces the first. */
export function useUndoToast(): {
  toast: ReactNode;
  show: (message: string, undo: () => void) => void;
} {
  const [item, setItem] = useState<{ key: number; message: string; undo: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setItem(null);
  }, []);

  const show = useCallback(
    (message: string, undo: () => void) => {
      if (timer.current) clearTimeout(timer.current);
      seq.current += 1;
      setItem({ key: seq.current, message, undo });
      timer.current = setTimeout(() => setItem(null), 5000);
    },
    [],
  );

  const toast = item ? (
    <div
      key={item.key}
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 16px",
        borderRadius: 999,
        background: "#1E1B18",
        color: "#F5EFE6",
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 8px 28px rgba(30,27,24,0.35)",
      }}
    >
      <span>{item.message}</span>
      <button
        type="button"
        onClick={() => {
          item.undo();
          hide();
        }}
        style={{
          background: "none",
          border: "none",
          padding: "6px 10px",
          margin: "-6px -8px -6px 0",
          cursor: "pointer",
          color: "#e99a6f",
          fontWeight: 800,
          fontSize: 13,
        }}
      >
        Undo
      </button>
    </div>
  ) : null;

  return { toast, show };
}
