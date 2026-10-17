"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { secondTripCopy, secondTripProof } from "@/domain/second-trip";
import { scoreBand } from "@/domain/score";

interface HistEntry {
  /** Local runs stamp `Date.now()`; Supabase rows carry a uuid. Rows written
   *  before `listRuns` selected the id have neither, so the render key falls
   *  back to `savedAt` rather than trusting `id` to exist. */
  id?: number | string;
  savedAt: string;
  trip: { origin: { code: string }; destination: { code: string }; requiredShiftMin: number; direction: "east" | "west" } | null;
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

  if (!loaded) return <main className="flex min-h-screen items-center justify-center text-clay-2">loading…</main>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-clay-2 hover:text-clay">← Today</Link>
          <h1 className="mt-2 text-lg font-bold tracking-[0.3em] text-clay">TRIP HISTORY</h1>
        </div>
        <button onClick={clear} className="text-xs text-clay-2 hover:text-clay-fail">clear</button>
        <button
          onClick={() => {
            ["meridian:lastPlan","meridian:lastTrip","meridian:history","meridian:outcomes","meridian:checkins"].forEach((k) => {
              try { localStorage.removeItem(k); } catch {}
            });
            setItems([]);
          }}
          className="ml-3 text-xs text-clay-2 hover:text-clay-fail"
        >
          reset all
        </button>
      </header>

      {items.length === 0 && (
        <p className="text-sm text-clay-2">No completed runs yet.</p>
      )}

      <ul className="space-y-3">
        {items.map((it, idx) => (
          <HistoryCard
            // `id` when we have one, `savedAt` when we don't. Two runs in the
            // same millisecond would still collide on the former, but that is
            // a narrower failure than the unconditional undefined key this
            // replaces, and the pair is stable across re-renders either way.
            key={`${it.id ?? "row"}-${it.savedAt}-${idx}`}
            entry={it}
            older={items.slice(idx + 1)}
          />
        ))}
      </ul>
    </main>
  );
}

/** One trip card with its proof line: the most recent *older* trip on a
 *  different route — what the crew carried into this one. Same-route and
 *  corrupt rows are skipped by the contract; a null proof renders nothing
 *  rather than an invented "remembers". Split out so the proof memo lives
 *  in a component, not in a map callback. */
function HistoryCard({ entry: it, older }: { entry: HistEntry; older: HistEntry[] }) {
  const proof = useMemo(
    () =>
      it.trip
        ? secondTripProof(older, {
            origin: it.trip.origin.code,
            destination: it.trip.destination.code,
          })
        : null,
    [older, it.trip],
  );
  // This card is a dark island (Card = bg-ink-2), so the band wears the ink
  // palette rather than the cream one the page chrome uses. Same bands, same
  // PASS_SCORE — the number stops being decorative and starts reporting.
  const band = scoreBand(it.score);
  const scoreTone =
    band === "pass" ? "text-pass" : band === "warn" ? "text-sun-dest" : "text-fail";
  return (
    <li><Card className="p-4">
      <div className="flex items-baseline justify-between">
        <div className="font-mono2 text-xs text-paper">
          {it.trip ? `${it.trip.origin.code} → ${it.trip.destination.code} · ${Math.abs(it.trip.requiredShiftMin / 60)}h ${it.trip.direction}` : "Demo trip"}
        </div>
        <div className="flex items-center gap-2">
          {it.provider && <span className="font-mono2 text-xs text-mist">{it.provider}</span>}
          {it.fallback && <span className="rounded bg-fail/10 px-1.5 py-0.5 text-xs text-fail">fallback</span>}
          <div className={`font-mono2 text-xs ${scoreTone}`}>{it.score.toFixed(2)}</div>
        </div>
      </div>
      <div className="mt-1 text-xs text-dim">{new Date(it.savedAt).toLocaleString()}</div>
      <div className="mt-2 text-xs text-mist">{it.summary}</div>
      {proof ? (
        <div className="mt-2 text-xs text-dim" style={{ fontStyle: "italic" }}>
          {secondTripCopy(proof)}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {it.days.map((d, i) => (
          <span key={i} className="rounded border border-line bg-ink-3 px-2 py-0.5 font-mono2 text-xs text-mist">
            {d.label} {d.shiftMin}m
          </span>
        ))}
      </div>
    </Card>
    </li>
  );
}