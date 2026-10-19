"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface HistEntry {
  id: number;
  savedAt: string;
  trip: {
    origin: { code: string };
    destination: { code: string };
    requiredShiftMin: number;
    direction: string;
  } | null;
  score: number;
  summary: string;
  days: { label: string; shiftMin: number }[];
  provider?: string;
  fallback?: boolean;
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let local: HistEntry[] = [];
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem("meridian:history");
        local = raw ? (JSON.parse(raw) as HistEntry[]) : [];
        setItems(local);
      } catch {
        setItems([]);
      } finally {
        setLoaded(true);
      }
    }, 0);
    fetch("/api/persistence/runs")
      .then((r) => r.json())
      .then((d) => {
        if (!d?.enabled || !Array.isArray(d.runs)) return;
        const seen = new Set((d.runs as HistEntry[]).map((r) => r.savedAt));
        const merged = [
          ...(d.runs as HistEntry[]),
          ...local.filter((r) => !seen.has(r.savedAt)),
        ].slice(0, 20);
        setItems(merged);
      })
      .catch(() => {});
    return () => clearTimeout(t);
  }, []);

  const clear = () => {
    try {
      localStorage.removeItem("meridian:history");
    } catch {}
    setItems([]);
  };

  if (!loaded)
    return (
      <main className="flex min-h-screen items-center justify-center text-xs font-semibold text-[#7a6a5c]">
        loading…
      </main>
    );

  return (
    <main className="mx-auto max-w-3xl px-6 py-8 text-[#1E1B18]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[#e3d5c3] bg-[#FFF8EF] p-5">
        <div>
          <Link
            href="/"
            className="inline-block rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-3 py-1 text-xs font-bold text-[#1E1B18] hover:border-[#D96B43]"
          >
            ← Back to 24h Dial
          </Link>
          <h1 className="mt-3 text-lg font-extrabold tracking-[0.25em] text-[#1E1B18]">
            PAST RUNS &amp; TRIP HISTORY
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clear}
            className="rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-3.5 py-1.5 text-xs font-bold text-[#5b4d41] hover:border-[#B91C1C] hover:text-[#B91C1C]"
          >
            Clear history
          </button>
          <button
            onClick={() => {
              [
                "meridian:lastPlan",
                "meridian:lastTrip",
                "meridian:history",
                "meridian:outcomes",
                "meridian:checkins",
              ].forEach((k) => {
                try {
                  localStorage.removeItem(k);
                } catch {}
              });
              setItems([]);
            }}
            className="rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-3.5 py-1.5 text-xs font-bold text-[#5b4d41] hover:border-[#B91C1C] hover:text-[#B91C1C]"
          >
            Reset all local data
          </button>
        </div>
      </header>

      {items.length === 0 && (
        <div className="rounded-[24px] border border-[#e3d5c3] bg-[#FFF8EF] p-6 text-center text-sm text-[#5b4d41]">
          No completed runs yet.
        </div>
      )}

      <ul className="space-y-3">
        {items.map((it) => (
          <li
            key={it.id}
            className="rounded-[22px] border border-[#e3d5c3] bg-[#FFF8EF] p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-mono2 text-xs font-bold text-[#1E1B18]">
                {it.trip
                  ? `${it.trip.origin.code} → ${it.trip.destination.code} · ${Math.abs(it.trip.requiredShiftMin / 60)}h ${it.trip.direction}`
                  : "Demo trip"}
              </div>
              <div className="flex items-center gap-2">
                {it.provider && (
                  <span className="font-mono2 text-xs text-[#7a6a5c]">
                    {it.provider}
                  </span>
                )}
                {it.fallback && (
                  <span className="rounded-full bg-[#FEF2F2] px-2 py-0.5 text-xs font-bold text-[#7F1D1D]">
                    fallback
                  </span>
                )}
                <span className="rounded-full bg-[#E8F5EE] px-2.5 py-0.5 text-xs font-extrabold text-[#1B4D35]">
                  ✓ CHECKED
                </span>
              </div>
            </div>
            <div className="mt-1 text-xs text-[#7a6a5c]">
              {new Date(it.savedAt).toLocaleString()}
            </div>
            <div className="mt-2 text-xs leading-relaxed text-[#5b4d41]">
              {it.summary}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {it.days.map((d, i) => (
                <span
                  key={i}
                  className="rounded-full border border-[#e3d5c3] bg-[#f5efe6] px-2.5 py-0.5 font-mono2 text-xs font-semibold text-[#5b4d41]"
                >
                  {d.label} {d.shiftMin}m
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
