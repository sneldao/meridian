"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { BottomNav } from "@/components/BottomNav";
import { PageHeader } from "@/components/PageHeader";
import { useUndoToast } from "@/components/UndoToast";
import { secondTripCopy, secondTripProof } from "@/domain/second-trip";
import { meridianStorageKeys } from "@/lib/local-data";
import { scoreBand } from "@/domain/score";

interface HistTrip {
  origin: { code: string; name?: string };
  destination: { code: string; name?: string };
  requiredShiftMin: number;
  direction: "east" | "west";
  /** Present when the run persisted the whole Trip — carries the departure
   *  date the deep links below need to reopen or score this exact journey. */
  departureDayIndex?: number;
  days?: { dayIndex: number; label: string; date?: string }[];
}

interface HistEntry {
  /** Local runs stamp `Date.now()`; Supabase rows carry a uuid. Rows written
   *  before `listRuns` selected the id have neither, so the render key falls
   *  back to `savedAt` rather than trusting `id` to exist. */
  id?: number | string;
  savedAt: string;
  trip: HistTrip | null;
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

  const { toast, show } = useUndoToast();
  const snapshot = (keys: string[]) =>
    keys.map((k) => [k, localStorage.getItem(k)] as const);
  const restore = (snap: (readonly [string, string | null])[]) => {
    snap.forEach(([k, v]) => {
      try {
        if (v === null) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      } catch {}
    });
  };

  const clear = () => {
    const snap = snapshot(["meridian:history"]);
    try { localStorage.removeItem("meridian:history"); } catch {}
    setItems([]);
    show("History cleared", () => {
      restore(snap);
      try {
        const raw = localStorage.getItem("meridian:history");
        setItems(raw ? (JSON.parse(raw) as HistEntry[]) : []);
      } catch {
        setItems([]);
      }
    });
  };

  const deleteAll = () => {
    const snap = snapshot(meridianStorageKeys(localStorage));
    snap.forEach(([k]) => {
      try { localStorage.removeItem(k); } catch {}
    });
    setItems([]);
    show("This browser’s data cleared", () => {
      restore(snap);
      try {
        const raw = localStorage.getItem("meridian:history");
        setItems(raw ? (JSON.parse(raw) as HistEntry[]) : []);
      } catch {
        setItems([]);
      }
    });
  };

  if (!loaded) return <main className="flex min-h-screen items-center justify-center text-clay-2">Loading…</main>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <BottomNav />
      <PageHeader
        title="Trips"
        actions={
          <>
            {items.length > 0 && (
              <button onClick={clear} className="text-xs text-clay-2 hover:text-clay-fail">Clear history</button>
            )}
            <button onClick={deleteAll} className="text-xs text-clay-2 hover:text-clay-fail">Clear this browser’s data</button>
          </>
        }
      />

      <p className="mb-4 text-xs text-clay-2">
        Clearing affects this browser only — server records, shared cards,
        feeds and push subscriptions are not deleted, and server history may
        return on reload. See <Link href="/privacy" className="underline">Privacy &amp; support</Link>.
      </p>

      {items.length === 0 && (
        <p className="text-sm text-clay-2">No trips yet. Plans you make will show up here — each one keeps its plan, its gate score, and its arrival report.</p>
      )}

      {/* The deck (docs/DESIGN.md · Motion language): journeys stack and pin —
          scrolling riffls through trips instead of walking a table. Plain
          sticky stacking everywhere; the covered-card recede rides
          scroll-driven animations where they exist. */}
      <ul className="trip-deck">
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
      {toast}
    </main>
  );
}

/** One trip card with its proof line: the most recent *older* trip on a
 *  different route — what the crew carried into this one. Same-route and
 *  corrupt rows are skipped by the contract; a null proof renders nothing
 *  rather than an invented "remembers". Split out so the proof memo lives
 *  in a component, not in a map callback.
 *
 *  The card is also the door to the journey's other rooms: Today can reopen
 *  the trip, and the arrival report settles its payoff — so "Rate my trip"
 *  is not a nav destination but an action on the trip it belongs to. */
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
  const bandWord =
    band === "pass" ? "✓ Passed checks" : band === "warn" ? "Below our standard" : "Didn't pass";
  const bandTone =
    band === "pass" ? "text-pass" : band === "warn" ? "text-sun-dest" : "text-fail";
  // The departure date rides in the persisted trip's days when the run saved
  // the whole Trip; without it the links fall back to arrival's own defaults.
  const depDate = it.trip?.days?.find((d) => d.dayIndex === it.trip?.departureDayIndex)?.date;
  const tripParams = it.trip
    ? `origin=${it.trip.origin.code}&dest=${it.trip.destination.code}${depDate ? `&date=${depDate}` : ""}`
    : null;
  const actionCls =
    "rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-mist transition-colors hover:border-mist hover:text-paper";
  return (
    <li className="trip-deck-card"><Card className="p-4">
      <div className="flex items-baseline justify-between">
        <div className="font-mono2 text-xs text-paper">
          {it.trip
            ? `${it.trip.origin.code} → ${it.trip.destination.code} · ${Math.abs(it.trip.requiredShiftMin / 60)}h ${it.trip.direction === "east" ? "ahead" : "behind"}`
            : "Demo trip"}
        </div>
        <div className="flex items-center gap-2">
          {it.fallback && <span className="rounded bg-fail/10 px-1.5 py-0.5 text-xs text-fail">used a backup schedule</span>}
          <div className={`font-mono2 text-xs ${bandTone}`}>{bandWord}</div>
        </div>
      </div>
      {it.trip?.origin.name && (
        <div className="mt-1 text-sm font-semibold text-paper">
          {it.trip.origin.name} <span className="text-sun-dest">→</span> {it.trip.destination.name}
        </div>
      )}
      <div className="mt-1 text-xs text-dim">
        {new Date(it.savedAt).toLocaleString()} · {it.days.length} {it.days.length === 1 ? "day" : "days"} planned
      </div>
      {it.days.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {it.days.map((d) => (
            <span key={d.label} className="rounded-full border border-line px-2 py-0.5 font-mono2 text-xs text-dim">
              {d.label} {d.shiftMin === 0 ? "·" : `${d.shiftMin > 0 ? "+" : "−"}${Math.abs(d.shiftMin)}m`}
            </span>
          ))}
        </div>
      )}
      {proof ? (
        <div className="mt-2 text-xs text-dim" style={{ fontStyle: "italic" }}>
          {secondTripCopy(proof)}
        </div>
      ) : null}
      {tripParams && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line/60 pt-3">
          <Link href={`/?${tripParams}`} className={actionCls}>Open in Today</Link>
          <Link href={`/arrival?${tripParams}`} className={actionCls}>Arrival report</Link>
        </div>
      )}
    </Card>
    </li>
  );
}