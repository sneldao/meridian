"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface HistEntry {
  id: number;
  savedAt: string;
  trip: { origin: { code: string }; destination: { code: string }; requiredShiftMin: number; direction: string } | null;
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
    const t = setTimeout(() => {
      try {
        const raw = localStorage.getItem("meridian:history");
        setItems(raw ? (JSON.parse(raw) as HistEntry[]) : []);
      } catch {
        setItems([]);
      } finally {
        setLoaded(true);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const clear = () => {
    try { localStorage.removeItem("meridian:history"); } catch {}
    setItems([]);
  };

  if (!loaded) return <main className="flex min-h-screen items-center justify-center text-[#8b93a7]">loading…</main>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-[10px] tracking-widest text-[#8b93a7] uppercase hover:text-[#e8eaf2]">← deck</Link>
          <h1 className="mt-2 text-lg font-bold tracking-[0.3em] text-[#e8eaf2]">TRIP HISTORY</h1>
        </div>
        <button onClick={clear} className="text-[10px] text-[#8b93a7] hover:text-[#ff7a7a]">clear</button>
        <button
          onClick={() => {
            ["meridian:lastPlan","meridian:lastTrip","meridian:history","meridian:outcomes","meridian:checkins"].forEach((k) => {
              try { localStorage.removeItem(k); } catch {}
            });
            setItems([]);
          }}
          className="ml-3 text-[10px] text-[#8b93a7] hover:text-[#ff7a7a]"
        >
          reset all
        </button>
      </header>

      {items.length === 0 && (
        <p className="text-sm text-[#8b93a7]">No completed runs yet.</p>
      )}

      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id} className="rounded-xl border border-[#1e2637] bg-[#0c1018] p-4">
            <div className="flex items-baseline justify-between">
              <div className="font-mono2 text-[12px] text-[#e8eaf2]">
                {it.trip ? `${it.trip.origin.code} → ${it.trip.destination.code} · ${Math.abs(it.trip.requiredShiftMin / 60)}h ${it.trip.direction}` : "Demo trip"}
              </div>
              <div className="flex items-center gap-2">
                {it.provider && <span className="font-mono2 text-[10px] text-[#8b93a7]">{it.provider}</span>}
                {it.fallback && <span className="rounded bg-[#ff7a7a22] px-1.5 py-0.5 text-[10px] text-[#ff7a7a]">fallback</span>}
                <div className="font-mono2 text-[12px] text-[#b8e356]">{it.score.toFixed(2)}</div>
              </div>
            </div>
            <div className="mt-1 text-[10px] text-[#4a5470]">{new Date(it.savedAt).toLocaleString()}</div>
            <div className="mt-2 text-[11px] text-[#8b93a7]">{it.summary}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {it.days.map((d, i) => (
                <span key={i} className="rounded border border-[#1e2637] bg-[#131826] px-2 py-0.5 font-mono2 text-[10px] text-[#8b93a7]">
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