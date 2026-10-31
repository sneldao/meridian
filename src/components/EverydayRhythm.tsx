"use client";

import { useEffect, useState } from "react";

const KEY = "meridian:everyday:marks";

export function EverydayRhythm() {
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setMarks(JSON.parse(raw));
    } catch {}
  }, []);
  const toggle = (k: string) => {
    const next = { ...marks, [k]: !marks[k] };
    setMarks(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  };
  const items = [
    { key: "morning", label: "Morning light" },
    { key: "caffeine", label: "Caffeine curfew" },
    { key: "winddown", label: "Evening wind-down" },
  ];
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
    </div>
  );
}
