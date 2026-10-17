"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { fmtMin } from "@/domain/circadian";
import { scoreBand } from "@/domain/score";
import type { Citation, DayPlan, DaySpec, EvalResult } from "@/domain/types";
import { INTERVENTION_ICONS } from "@/lib/intervention-icons";
import { ShiftBoard, type ShiftDraft } from "@/components/lenses/ShiftBoard";

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
  /** Full trip days when `run_start` persisted the whole Trip. */
  days?: DaySpec[];
}

const PLAN_KEY = "meridian:lastPlan";
const TRIP_KEY = "meridian:lastTrip";

// The swimlane is a read-only ShiftBoard: a finished run has nothing drafting
// and nothing being scanned — every row is locked.
const NO_DRAFTS = new Map<string, ShiftDraft>();
const NO_VERDICTS = new Map<string, EvalResult[]>();

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
    return <main className="flex min-h-screen items-center justify-center text-xs text-clay-2">loading…</main>;
  }

  if (!plan) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10 text-center">
        <h1 className="text-lg font-bold tracking-[0.3em] text-clay">MERIDIAN</h1>
        <p className="mt-4 text-sm text-clay-2">No saved handoff yet. Run a night shift first.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-paper px-5 py-2 text-sm font-bold text-ink">Back to Today</Link>
      </main>
    );
  }

  const citIndex = new Map(plan.citations.map((c, i) => [c.id, i + 1]));
  const specs: DaySpec[] = trip?.days?.length
    ? trip.days
    : plan.days.map((d) => ({ dayIndex: d.dayIndex, label: d.label, date: "" }));
  const locked = new Map(plan.days.map((d) => [d.label, d]));
  const shiftH = trip ? `${Math.abs(trip.requiredShiftMin / 60)}h ${trip.direction}` : "";
  // The score wears its band. On cream a bare `text-pass` (lime, tuned for
  // ink) washed out, and an unconditional green read a failed 0.00 plan as
  // a healthy one. Bands come from the gate's own PASS_SCORE.
  const scoreTone =
    scoreBand(plan.score) === "pass"
      ? "text-clay-pass"
      : scoreBand(plan.score) === "warn"
        ? "text-terracotta"
        : "text-clay-fail";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-xs tracking-wide text-clay-2 hover:text-clay">← Today</Link>
          <h1 className="mt-2 text-lg font-bold tracking-[0.3em] text-clay">HANDOFF REVIEW</h1>
          {trip && (
            <div className="mt-1 font-mono2 text-xs text-clay-2">
              {trip.origin.code} <span className="text-sun-dest">→</span> {trip.destination.code} · {shiftH}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className={`font-mono2 text-3xl font-bold ${scoreTone}`}>{plan.score.toFixed(2)}</div>
          <div className="text-xs text-clay-2">
            plan score ·{" "}
            {scoreBand(plan.score) === "pass"
              ? "at or above the gate"
              : scoreBand(plan.score) === "warn"
                ? "under the gate"
                : "failed the gate"}
          </div>
        </div>
      </header>

      <p className="font-voice max-w-3xl text-lg leading-relaxed text-clay">{plan.summary}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={downloadIcs} className="rounded-lg bg-paper px-4 py-2 text-sm font-bold text-ink transition-colors hover:bg-white">Add to calendar (.ics)</button>
        <button onClick={downloadMarkdown} className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-sm font-bold text-paper transition-colors hover:border-mist">Export markdown</button>
        <button onClick={clearPlan} className="rounded-lg px-4 py-2 text-sm text-clay-2 transition-colors hover:text-clay-fail">Clear saved plan</button>
        <Link href="/outcome" className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-sm text-mist transition-colors hover:text-paper">Log outcome</Link>
        <ReplanLink trip={trip} />
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-clay-2">The week, hour by hour</h2>
          <p className="mt-1 text-xs leading-relaxed text-clay-2">
            Body-clock time across 24 hours. The sleep bar steps earlier day by day — that diagonal is the shift.
          </p>
          <Card className="mt-3 h-[380px] overflow-hidden">
            <ShiftBoard days={specs} drafts={NO_DRAFTS} verdicts={NO_VERDICTS} locked={locked} readOnly />
          </Card>

          <div className="mt-6 space-y-4">
            {plan.days.map((d) => (
              <Card key={d.dayIndex} className="p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-bold text-paper">{d.label}</h3>
                  <span className="font-mono2 text-xs text-mist">{d.shiftMin} min shift</span>
                </div>
                <div className="mt-1 flex gap-4 font-mono2 text-xs text-mist">
                  <span>bed <span className="text-paper">{fmtMin(d.targetBedtimeMin)}</span></span>
                  <span>wake <span className="text-paper">{fmtMin(d.targetWakeMin)}</span></span>
                </div>
                <ul className="mt-3 space-y-2.5">
                  {d.interventions.map((iv, j) => {
                    const IconInfo = INTERVENTION_ICONS[iv.kind];
                    const ref = iv.citationId ? citIndex.get(iv.citationId) : undefined;
                    const Icon = IconInfo?.icon;
                    return (
                      <li key={j} className="flex gap-3">
                        <span className="mt-0.5 shrink-0" style={{ color: IconInfo?.tint ?? "var(--color-mist)" }}>
                          {Icon ? <Icon size={14} strokeWidth={2.2} /> : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-paper">
                            <span className="font-semibold">{iv.kind.replace(/_/g, " ")}</span>
                            <span className="ml-2 font-mono2 text-mist">{fmtMin(iv.startMin)}{iv.endMin ? `–${fmtMin(iv.endMin)}` : ""}</span>
                            {ref && <sup className="ml-1 font-mono2 text-xs text-mist">{ref}</sup>}
                          </div>
                          <div className="text-xs leading-relaxed text-mist">{iv.note}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </div>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-sm font-bold text-terracotta">Evidence</h2>
          {plan.citations.length === 0 ? (
            <p className="mt-2 text-xs text-clay-2">No citations were required for this plan.</p>
          ) : (
            <ol className="mt-2 space-y-2">
              {plan.citations.map((c, i) => (
                <li key={c.id} className="flex gap-2 text-xs leading-relaxed text-clay-2">
                  <span className="font-mono2 text-clay">{i + 1}</span>
                  <span className="min-w-0">
                    <a
                      href={c.doi ? `https://doi.org/${c.doi}` : c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-clay hover:underline"
                    >
                      {c.title}
                    </a>
                    {c.year ? ` (${c.year})` : ""}{c.venue ? ` · ${c.venue}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </section>
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
      // Review doesn't persist the departure date; leave date to home defaults if absent.
      params.set("checkins", btoa(JSON.stringify(checkIns)));
      params.set("startDay", "0");
      href = "/?" + params.toString();
    }
  } catch {
    /* ignore */
  }
  if (href === "/") return null;
  return (
    <Link href={href} className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-sm text-mist transition-colors hover:text-paper">
      Replan with check-ins
    </Link>
  );
}
