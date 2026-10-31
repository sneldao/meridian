"use client";

import { useCallback } from "react";

/**
 * Same-document view transitions for in-place surface changes: the trigger
 * grows into the panel instead of a drawer sliding up from nowhere
 * (design.md · Motion language). Pair the trigger and the panel under one
 * `view-transition-name` in CSS — only one of them holds the name at a time,
 * so the browser FLIPs between the two rects while the rest of the page
 * crossfades underneath.
 *
 * Degrades by design: without the API, or under `prefers-reduced-motion`,
 * the state update runs plainly and the existing sheet motion is what the
 * traveller gets.
 */

type ViewTransitionDoc = Document & {
  startViewTransition?: (update: () => void) => unknown;
};

export function useMorphTransition() {
  return useCallback((update: () => void) => {
    if (typeof document === "undefined") {
      update();
      return;
    }
    const doc = document as ViewTransitionDoc;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || reduce) {
      update();
      return;
    }
    doc.startViewTransition(update);
  }, []);
}
