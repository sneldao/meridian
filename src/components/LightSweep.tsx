"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * The light pass (docs/DESIGN.md · Motion language): in-page mode switches
 * pass a sharp leading edge with a trailing gradient tail up across the
 * content — light crossing the page instead of a drawer. Transform + opacity
 * only, one 900ms travel (--dur-light-pass); never fires under
 * `prefers-reduced-motion`, and the node unmounts itself once the pass ends.
 *
 * Usage:
 *   const { sweep, node } = useLightSweep();
 *   <button onClick={() => { sweep(); flipMode(); }}>…</button>
 *   {node}
 */

export function LightPass() {
  return <div className="light-pass" aria-hidden="true" />;
}

export function useLightSweep(): { sweep: () => void; node: ReactNode } {
  const [id, setId] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const sweep = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    seq.current += 1;
    setId(seq.current);
  }, []);

  useEffect(() => {
    if (!id) return;
    timer.current = setTimeout(() => setId(0), 1000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id]);

  const node: ReactNode = id > 0 ? (
    <div key={id} className="light-sweep" aria-hidden="true">
      <LightPass />
    </div>
  ) : null;

  return { sweep, node };
}
