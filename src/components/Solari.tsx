"use client";

import { useEffect, useRef, useState } from "react";

/* The departure board — a Solari roll for values that change. Each cell is a
 *  clip with two layers: the outgoing character rolls up and away, the
 *  incoming rolls in from below, the way a split-flap answers a timetable.
 *  Input-caused by definition — the board only moves when the data does —
 *  transform-only, and under reduced motion the new value simply appears
 *  (the same settled state, minus the flap). The announced text is always
 *  the real value; the flap is chrome. */
export function Solari({ value, className }: { value: string; className?: string }) {
  const [prev, setPrev] = useState<string | null>(null);
  const last = useRef(value);

  useEffect(() => {
    if (last.current === value) return;
    setPrev(last.current);
    last.current = value;
    const t = setTimeout(() => setPrev(null), 400);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <span className={`solari${className ? ` ${className}` : ""}`} aria-label={value}>
      {value.split("").map((ch, i) => {
        const old = prev && prev.length === value.length ? prev[i] : null;
        const flip = old !== null && old !== ch;
        return (
          <span key={i} className="solari-cell" aria-hidden="true">
            {flip && (
              <span key={`o${prev}`} className="solari-old">
                {old}
              </span>
            )}
            <span key={flip ? `n${value}` : `s${ch}`} className={flip ? "solari-new" : "solari-still"}>
              {ch}
            </span>
          </span>
        );
      })}
    </span>
  );
}
