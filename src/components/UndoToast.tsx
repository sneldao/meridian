"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** How long "Undo" lives, and how long the glide-out takes. EXIT_MS must
 *  cover the exit transition (--dur-glide, 180ms) so the toast finishes
 *  leaving before it unmounts. */
export const TOAST_MS = 5000;
export const TOAST_EXIT_MS = 200;

/** The pill itself, split from the timers so tests can render both beats:
 *  arrived (spring in) and leaving (glide out over the life bar's last
 *  breath). The bar is decorative — the role=status message is the truth. */
export function UndoToastCard({
  message,
  leaving,
  onUndo,
}: {
  message: string;
  leaving: boolean;
  onUndo: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={leaving ? "undo-toast toast-out" : "undo-toast toast-in"}
    >
      <span>{message}</span>
      <button type="button" onClick={onUndo} className="undo-toast-btn">
        Undo
      </button>
      <span className="toast-life" aria-hidden="true" />
    </div>
  );
}

/** "Done — Undo" in a bottom pill for 5s. A second show() replaces the
 *  first, and the pill glides out instead of blinking away at the deadline. */
export function useUndoToast(): {
  toast: ReactNode;
  show: (message: string, undo: () => void) => void;
} {
  const [item, setItem] = useState<{ key: number; message: string; undo: () => void; leaving: boolean } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const seq = useRef(0);

  const clearTimers = () => {
    for (const t of timers.current) clearTimeout(t);
    timers.current = [];
  };

  const hide = useCallback(() => {
    clearTimers();
    setItem(null);
  }, []);

  useEffect(() => clearTimers, []);

  const show = useCallback(
    (message: string, undo: () => void) => {
      clearTimers();
      seq.current += 1;
      const key = seq.current;
      setItem({ key, message, undo, leaving: false });
      timers.current.push(
        setTimeout(() => {
          setItem((cur) => (cur && cur.key === key ? { ...cur, leaving: true } : cur));
        }, TOAST_MS - TOAST_EXIT_MS),
      );
      timers.current.push(setTimeout(() => {
        setItem((cur) => (cur && cur.key === key ? null : cur));
      }, TOAST_MS));
    },
    [],
  );

  const toast = item ? (
    <UndoToastCard
      key={item.key}
      message={item.message}
      leaving={item.leaving}
      onUndo={() => {
        item.undo();
        hide();
      }}
    />
  ) : null;

  return { toast, show };
}
