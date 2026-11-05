"use client";

import { useEffect, type RefObject } from "react";

/* Pointer depth — input-caused motion only: a stage's planes drift with the
 *  visitor's pointer at different rates, a diorama the hand tilts. Writes
 *  --px/--py (-1..1) on the element; each plane's CSS multiplies them by its
 *  own depth and a settle transition smooths the follow. rAF-batched, back
 *  to rest on leave. Reduced motion and coarse pointers never write — the
 *  scene simply sits, the same settled state as always. */
export function useDepthParallax(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    let raf = 0;
    const write = (x: number, y: number) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--px", x.toFixed(3));
        el.style.setProperty("--py", y.toFixed(3));
      });
    };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      write(
        Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)),
        Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)),
      );
    };
    const leave = () => write(0, 0);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, [ref]);
}
