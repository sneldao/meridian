"use client";

import { useEffect, useState } from "react";

/**
 * A number that counts up to its true value once, when it arrives on screen.
 * The display always ENDS at exactly `value` — no invented figures (vision.md
 * trust rule). Strings that don't parse as a number render untouched, and
 * reduced-motion renders the final value immediately. The animated text is
 * aria-hidden with the real value announced beside it, so a screen reader
 * never hears the ramp.
 */
export function CountUp({ value, ms = 650 }: { value: string; ms?: number }) {
  const [display, setDisplay] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  // Adjust state during render (the React-recommended reset pattern) so a
  // changed `value` restarts from truth rather than a stale ramp.
  if (prevValue !== value) {
    setPrevValue(value);
    setDisplay(value);
  }
  const match = /^([+-]?\d+(?:\.\d+)?)(.*)$/.exec(value.trim());
  const numText = match?.[1] ?? null;
  const suffix = match ? match[2] : "";

  useEffect(() => {
    if (numText === null) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const target = parseFloat(numText);
    const decimals = numText.includes(".") ? numText.split(".")[1].length : 0;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(`${(target * eased).toFixed(decimals)}${suffix}`);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
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
