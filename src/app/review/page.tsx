"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtMin } from "@/domain/circadian";
import type { Citation, DayPlan } from "@/domain/types";
import { INTERVENTION_ICONS } from "@/lib/intervention-icons";

interface SavedPlan {
  summary: string;
  score: number;
  citations: Citation[];
  days: DayPlan[];
  ics: string;
}

interface SavedTrip {
  origin: { code: string; name: string; utcOffsetMin: number };
  destination: { code: string; name: string; utcOffsetMin: number };
  requiredShiftMin: number;
  direction: "east" | "west";
}

const PLAN_KEY = "meridian:lastPlan";
const TRIP_KEY = "meridian:lastTrip";

export default function ReviewPage() {
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [trip, setTrip] = useState<SavedTrip | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const p = localStorage.getItem(PLAN_KEY);
        const t = localStorage.getItem(TRIP_KEY);
        if (p) setPlan(JSON.parse(p) as SavedPlan);
        if (t) setTrip(JSON.parse(t) as SavedTrip);
      } catch {
        // ignore corrupt storage
      } finally {
        setLoaded(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const downloadIcs = () => {
    if (!plan) return;
    const blob = new Blob([plan.ics], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "meridian-shift-plan.ics";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const downloadMarkdown = () => {
    if (!plan) return;
    const citMap = new Map(plan.citations.map((c) => [c.id, c]));
    const lines: string[] = [];
    lines.push("# Meridian shift plan");
    lines.push("");
    if (trip) lines.push(`**Route:** ${trip.origin.code} → ${trip.destination.code} · ${Math.abs(trip.requiredShiftMin / 60)}h ${trip.direction}`);
    lines.push(`**Score:** ${plan.score.toFixed(2)}`);
    lines.push("");
    lines.push(plan.summary);
    lines.push("");
    for (const d of plan.days) {
      lines.push(`## ${d.label}`);
      lines.push(`- Shift: ${d.shiftMin} min`);
      lines.push(`- Target bedtime: ${fmtMin(d.targetBedtimeMin)}`);
      lines.push(`- Target wake: ${fmtMin(d.targetWakeMin)}`);
      lines.push("");
      lines.push("Interventions:");
      for (const iv of d.interventions) {
        const cit = iv.citationId ? citMap.get(iv.citationId) : undefined;
        lines.push(`- **${iv.kind.replace(/_/g, " ")}** ${fmtMin(iv.startMin)}${iv.endMin ? `–${fmtMin(iv.endMin)}` : ""} — ${iv.note}${cit ? ` (${cit.title}${cit.year ? `, ${cit.year}` : ""})` : ""}`);
      }
      lines.push("");
    }
    if (plan.citations.length) {
      lines.push("## Evidence");
      for (const c of plan.citations) {
        lines.push(`- ${c.title}${c.year ? ` (${c.year})` : ""}${c.venue ? ` — ${c.venue}` : ""}${c.doi ? ` — https://doi.org/${c.doi}` : c.url ? ` — ${c.url}` : ""}`);
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "meridian-shift-plan.md";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const clearPlan = () => {
    try {
      localStorage.removeItem(PLAN_KEY);
      localStorage.removeItem(TRIP_KEY);
    } catch {}
    setPlan(null);
    setTrip(null);
  };

  if (!loaded) {
    return <main className="flex min-h-screen items-center justify-center text-mist">loading…</main>;
  }

  if (!plan) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10 text-center">
        <h1 className="text-lg font-bold tracking-[0.3em] text-paper">MERIDIAN</h1>
        <p className="mt-4 text-sm text-mist">No saved handoff yet. Run a night shift first.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-lime px-5 py-2 text-xs font-bold text-ink">Back to deck</Link>
      </main>
    );
  }

  const citMap = new Map(plan.citations.map((c) => [c.id, c]));

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-[10px] tracking-widest text-mist uppercase hover:text-paper">← deck</Link>
          <h1 className="mt-2 text-lg font-bold tracking-[0.3em] text-paper">HANDOFF REVIEW</h1>
        </div>
        <div className="text-right">
          <div className="font-mono2 text-3xl font-bold text-lime">{plan.score.toFixed(2)}</div>
          <div className="text-[10px] tracking-widest text-mist uppercase">plan score</div>
        </div>
      </header>

      {trip && (
        <div className="mb-4 rounded-lg border border-line bg-ink-2 px-3 py-1.5 font-mono2 text-[11px] text-mist">
          {trip.origin.code} <span className="text-sun-dest">→</span> {trip.destination.code} · {Math.abs(trip.requiredShiftMin / 60)}h {trip.direction}
        </div>
      )}

      <p className="text-sm leading-relaxed text-paper">{plan.summary}</p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={downloadIcs} className="rounded-lg bg-sun-dest px-4 py-2 text-xs font-bold text-ink transition-colors hover:bg-[#ffd98a]">Add to calendar (.ics)</button>
        <button onClick={downloadMarkdown} className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-xs font-bold text-paper transition-colors hover:border-mist">Export markdown</button>
        <button onClick={clearPlan} className="rounded-lg px-4 py-2 text-xs text-mist transition-colors hover:text-rose">Clear saved plan</button>
        <Link href="/outcome" className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-xs text-mist transition-colors hover:text-paper">Log outcome</Link>
        <ReplanLink trip={trip} />
      </div>

      <section className="mt-8 space-y-4">
        {plan.days.map((d) => (
          <article key={d.dayIndex} className="rounded-xl border border-line bg-ink-2 p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold text-paper">{d.label}</h2>
              <span className="font-mono2 text-[11px] text-mist">{d.shiftMin} min shift</span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2 font-mono2 text-[11px] text-mist">
              <div>bed <span className="text-paper">{fmtMin(d.targetBedtimeMin)}</span></div>
              <div>wake <span className="text-paper">{fmtMin(d.targetWakeMin)}</span></div>
            </div>
            <ul className="mt-3 space-y-2">
              {d.interventions.map((iv, j) => {
                const IconInfo = INTERVENTION_ICONS[iv.kind];
                const cit = iv.citationId ? citMap.get(iv.citationId) : undefined;
                const Icon = IconInfo?.icon;
                return (
                  <li key={j} className="flex gap-3">
                    <span className="mt-0.5 shrink-0" style={{ color: IconInfo?.tint ?? "#8b93a7" }}>
                      {Icon ? <Icon size={13} strokeWidth={2.2} /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-paper">
                        <span className="font-semibold">{iv.kind.replace(/_/g, " ")}</span>
                        <span className="ml-2 font-mono2 text-mist">{fmtMin(iv.startMin)}{iv.endMin ? `–${fmtMin(iv.endMin)}` : ""}</span>
                      </div>
                      <div className="text-[11px] leading-relaxed text-mist">{iv.note}</div>
                      {cit && (
                        <a
                          href={cit.doi ? `https://doi.org/${cit.doi}` : cit.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 block truncate text-[10px] text-lime hover:underline"
                        >
                          {cit.title}{cit.year ? ` (${cit.year})` : ""}
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </section>

      {plan.citations.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[10px] font-bold tracking-[0.2em] text-sun-dest uppercase">Evidence</h2>
          <ul className="mt-2 space-y-1.5">
            {plan.citations.map((c) => (
              <li key={c.id} className="text-[11px] text-mist">
                <a
                  href={c.doi ? `https://doi.org/${c.doi}` : c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-paper hover:text-lime hover:underline"
                >
                  {c.title}
                </a>
                {c.year ? ` (${c.year})` : ""}{c.venue ? ` · ${c.venue}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
function ReplanLink({ trip }: { trip: SavedTrip | null }) {
  let href = "/";
  try {
    const checkIns = JSON.parse(localStorage.getItem("meridian:checkins") || "[]");
    if (checkIns.length) {
      const params = new URLSearchParams();
      if (trip?.origin?.code) params.set("origin", trip.origin.code);
      if (trip?.destination?.code) params.set("dest", trip.destination.code);
      // Review doesn't persist the departure date; fall back to today's ISO date never,
      // so leave date to home defaults if absent.
      params.set("checkins", btoa(JSON.stringify(checkIns)));
      params.set("startDay", "0");
      href = "/?" + params.toString();
    }
  } catch {
    /* ignore */
  }
  if (href === "/") return null;
  return (
    <Link href={href} className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-xs text-mist transition-colors hover:text-paper">
      Replan with check-ins
    </Link>
  );
}
