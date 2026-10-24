"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that tweens from its previous value to a new one when it changes
 * (design.md · number continuity). Different from `CountUp`, which counts from
 * zero on mount — right for a figure that has just arrived. This one only
 * animates on a real change, never on first paint, and only while the unit
 * (the text after the number) stays the same: a unit change snaps, so a figure
 * never reads "40h" on its way to "1.5h".
 *
 * The animated text is aria-hidden and the true value is announced beside it,
 * exactly like CountUp — a screen reader never hears the ramp. Reduced motion
 * renders the final value immediately.
 */
export function TweenNumber({ value, ms = 550 }: { value: string; ms?: number }) {
  const match = /^([+-]?\d+(?:\.\d+)?)(.*)$/.exec(value.trim());
  const target = match ? parseFloat(match[1]) : null;
  const decimals = match && match[1].includes(".") ? match[1].split(".")[1].length : 0;
  const suffix = match ? match[2] : "";

  const [display, setDisplay] = useState(value);
  /** What is on screen right now, and its unit — so an interrupted tween
   *  resumes from the visible number instead of jumping. */
  const shown = useRef<{ n: number; unit: string } | null>(
    target === null ? null : { n: target, unit: suffix },
  );

  useEffect(() => {
    if (target === null) return;
    const prev = shown.current;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const sameUnit = prev !== null && prev.unit === suffix;
    const from = sameUnit ? prev.n : target;
    if (reduce || !sameUnit || from === target) {
      /* Snap — deferred a frame so the effect body never sets state
         synchronously (React Compiler lint) and the value lands after paint. */
      const id = requestAnimationFrame(() => {
        shown.current = { n: target, unit: suffix };
        setDisplay(value);
      });
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const n = from + (target - from) * eased;
      shown.current = { n, unit: suffix };
      setDisplay(`${n.toFixed(decimals)}${suffix}`);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        shown.current = { n: target, unit: suffix };
        setDisplay(value);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <>
      <span aria-hidden="true">{display}</span>
      <span className="sr-only">{value}</span>
    </>
  );
}
