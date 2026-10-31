"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The light sweep (design.md · Motion language): in-page mode switches pass
 * two stage layers — horizon gold, then a band of the page's own ground —
 * up across the content, so a view change reads as light crossing the page
 * instead of a drawer. Transform-only; never fires under
 * `prefers-reduced-motion`, and the node unmounts itself once the pass ends.
 *
 * Usage:
 *   const { sweep, node } = useLightSweep();
 *   <button onClick={() => { sweep(); flipMode(); }}>…</button>
 *   {node}
 */
export function useLightSweep(): { sweep: () => void; node: ReactNode } {
  const [id, setId] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sweep = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setId((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!id) return;
    // Longest layer: 90ms delay + 560ms pass, with a beat of margin.
    timer.current = setTimeout(() => setId(0), 760);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id]);

  const node: ReactNode =
    id > 0 ? (
      <div key={id} className="light-sweep" aria-hidden="true">
        <div className="light-sweep-layer gold" />
        <div className="light-sweep-layer ground" />
      </div>
    ) : null;

  return { sweep, node };
}
