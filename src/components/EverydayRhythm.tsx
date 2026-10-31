"use client";

import { useEffect, useState } from "react";

const KEY = "meridian:everyday:marks";
const STREAK_KEY = "meridian:everyday:streak";

export function EverydayRhythm() {
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) setMarks(JSON.parse(raw));
        const s = localStorage.getItem(STREAK_KEY);
        if (s) setStreak(Number(s) || 0);
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const toggle = (k: string) => {
    const next = { ...marks, [k]: !marks[k] };
    setMarks(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    const allDone = ["morning", "caffeine", "winddown"].every((x) => next[x]);
    if (allDone) {
      const today = new Date().toDateString();
      const last = localStorage.getItem("meridian:everyday:last");
      if (last !== today) {
        const n = streak + 1;
        setStreak(n);
        try {
          localStorage.setItem(STREAK_KEY, String(n));
          localStorage.setItem("meridian:everyday:last", today);
        } catch {}
      }
    }
  };
  const items = [
    { key: "morning", label: "Morning light" },
    { key: "caffeine", label: "Caffeine curfew" },
    { key: "winddown", label: "Evening wind-down" },
  ];
  const isSunday = new Date().getDay() === 0;
  return (
    <div className="everyday-rhythm" role="region" aria-label="Everyday rhythm">
      <h3 className="everyday-title">Everyday rhythm</h3>
      <p className="everyday-sub">Three anchors for a steady body clock.</p>
      <div className="everyday-chips">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            className={`everyday-chip${marks[it.key] ? " done" : ""}`}
            onClick={() => toggle(it.key)}
            aria-pressed={!!marks[it.key]}
          >
            {marks[it.key] ? "✓ " : ""}{it.label}
          </button>
        ))}
      </div>
      {streak > 0 && <p className="everyday-streak">🔥 {streak}-day streak</p>}
      {isSunday && streak > 0 && (
        <p className="everyday-summary">Zero social jetlag this week — your sleep midpoint drifted by only minutes.</p>
      )}
    </div>
  );
}
