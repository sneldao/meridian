"use client";

import { useEffect, useState } from "react";

/**
 * A ticking clock that is honest about hydration: null on the server and on
 * the first client render, then the live Date, refreshed every intervalMs.
 * Mirrors the tick/`hydrated` pattern in HeroDawnPanel — surfaces that pass
 * this into `stageSkyFor` fall back to the CSS defaults until mounted.
 */
export function useLiveDate(intervalMs = 60_000): Date | null {
  const [tick, setTick] = useState(-1);
  useEffect(() => {
    const init = setTimeout(() => setTick(0), 0);
    const t = setInterval(() => setTick((v) => v + 1), intervalMs);
    return () => {
      clearTimeout(init);
      clearInterval(t);
    };
  }, [intervalMs]);
  return tick >= 0 ? new Date() : null;
}
