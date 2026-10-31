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
      className="undo-toast toast-in"
    >
      <span>{item.message}</span>
      <button
        type="button"
        onClick={() => {
          item.undo();
          hide();
        }}
        className="undo-toast-btn"
      >
        Undo
      </button>
    </div>
  ) : null;

  return { toast, show };
}
