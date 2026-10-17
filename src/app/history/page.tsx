"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";

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
        const merged = [...(d.runs as HistEntry[]), ...local.filter((r) => !seen.has(r.savedAt))].slice(0, 20);
        setItems(merged);
      })
      .catch(() => {});
    return () => clearTimeout(t);
  }, []);

  const clear = () => {
    try { localStorage.removeItem("meridian:history"); } catch {}
    setItems([]);
  };

  if (!loaded) return <main className="flex min-h-screen items-center justify-center text-mist">loading…</main>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-mist hover:text-paper">← Today</Link>
          <h1 className="mt-2 text-lg font-bold tracking-[0.3em] text-paper">TRIP HISTORY</h1>
        </div>
        <button onClick={clear} className="text-xs text-mist hover:text-fail">clear</button>
        <button
          onClick={() => {
            ["meridian:lastPlan","meridian:lastTrip","meridian:history","meridian:outcomes","meridian:checkins"].forEach((k) => {
              try { localStorage.removeItem(k); } catch {}
            });
            setItems([]);
          }}
          className="ml-3 text-xs text-mist hover:text-fail"
        >
          reset all
        </button>
      </header>

      {items.length === 0 && (
        <p className="text-sm text-mist">No completed runs yet.</p>
      )}

      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id}><Card className="p-4">
            <div className="flex items-baseline justify-between">
              <div className="font-mono2 text-xs text-paper">
                {it.trip ? `${it.trip.origin.code} → ${it.trip.destination.code} · ${Math.abs(it.trip.requiredShiftMin / 60)}h ${it.trip.direction}` : "Demo trip"}
              </div>
              <div className="flex items-center gap-2">
                {it.provider && <span className="font-mono2 text-xs text-mist">{it.provider}</span>}
                {it.fallback && <span className="rounded bg-fail/10 px-1.5 py-0.5 text-xs text-fail">fallback</span>}
                <div className="font-mono2 text-xs text-pass">{it.score.toFixed(2)}</div>
              </div>
            </div>
            <div className="mt-1 text-xs text-dim">{new Date(it.savedAt).toLocaleString()}</div>
            <div className="mt-2 text-xs text-mist">{it.summary}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {it.days.map((d, i) => (
                <span key={i} className="rounded border border-line bg-ink-3 px-2 py-0.5 font-mono2 text-xs text-mist">
                  {d.label} {d.shiftMin}m
                </span>
              ))}
            </div>
          </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}