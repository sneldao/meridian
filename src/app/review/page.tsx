"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { fmtMin } from "@/domain/circadian";
import { scoreBand } from "@/domain/score";
import type { Citation, DayPlan, DaySpec, EvalResult, ShiftCoverage } from "@/domain/types";
import { INTERVENTION_ICONS, INTERVENTION_LABELS } from "@/lib/intervention-icons";
import { friendlyDayLabel } from "@/lib/day-label";
import { planSummaryLine } from "@/lib/plan-copy";
import { PageHeader } from "@/components/PageHeader";
import { useUndoToast } from "@/components/UndoToast";
import { ShiftBoard, type ShiftDraft } from "@/components/lenses/ShiftBoard";

interface SavedPlan {
  summary: string;
  score: number;
  citations: Citation[];
  days: DayPlan[];
  ics: string;
  coverage?: ShiftCoverage;
}

interface SavedTrip {
  origin: { code: string; name: string; utcOffsetMin: number };
  destination: { code: string; name: string; utcOffsetMin: number };
  requiredShiftMin: number;
  direction: "east" | "west";
  departureDayIndex?: number;
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
    const dayName = (d: DayPlan) => {
      const spec = trip?.days?.find((s) => s.label === d.label);
      return spec ? friendlyDayLabel(spec, trip?.departureDayIndex) : d.label;
    };
    const lines: string[] = [];
    lines.push("# Meridian plan");
    lines.push("");
    if (trip) lines.push(`**Route:** ${trip.origin.name} → ${trip.destination.name} · ${trip.destination.name} is ${Math.abs(trip.requiredShiftMin / 60)}h ${trip.direction === "east" ? "ahead" : "behind"}`);
    lines.push("");
    lines.push(planSummaryLine(plan.coverage, trip?.destination.name, plan.citations.length));
    lines.push("");
    for (const d of plan.days) {
      lines.push(`## ${dayName(d)}`);
      if (d.shiftMin) lines.push(`- Moves your body clock ${Math.abs(d.shiftMin)} min`);
      lines.push(`- Bed ${fmtMin(d.targetBedtimeMin)} · Wake ${fmtMin(d.targetWakeMin)}`);
      lines.push("");
      for (const iv of d.interventions) {
        const cit = iv.citationId ? citMap.get(iv.citationId) : undefined;
        lines.push(`- **${INTERVENTION_LABELS[iv.kind] ?? iv.kind.replace(/_/g, " ")}** ${fmtMin(iv.startMin)}${iv.endMin ? `–${fmtMin(iv.endMin)}` : ""} — ${iv.note}${cit ? ` (${cit.title}${cit.year ? `, ${cit.year}` : ""})` : ""}`);
      }
      lines.push("");
    }
    if (plan.citations.length) {
      lines.push("## The research behind it");
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

  const { toast, show } = useUndoToast();
  const clearPlan = () => {
    const planRaw = localStorage.getItem(PLAN_KEY);
    const tripRaw = localStorage.getItem(TRIP_KEY);
    try {
      localStorage.removeItem(PLAN_KEY);
      localStorage.removeItem(TRIP_KEY);
    } catch {}
    setPlan(null);
    setTrip(null);
    show("Plan deleted", () => {
      try {
        if (planRaw) localStorage.setItem(PLAN_KEY, planRaw);
        if (tripRaw) localStorage.setItem(TRIP_KEY, tripRaw);
      } catch {}
      if (planRaw) setPlan(JSON.parse(planRaw) as SavedPlan);
      if (tripRaw) setTrip(JSON.parse(tripRaw) as SavedTrip);
    });
  };

  if (!loaded) {
    return <main className="flex min-h-screen items-center justify-center text-xs text-clay-2">Loading…</main>;
  }

  if (!plan) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10 text-center">
        <h1 className="text-lg font-bold text-clay">No saved plan yet.</h1>
        <p className="mt-4 text-sm text-clay-2">Make your plan on the home page and it&apos;ll be saved here.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-paper px-5 py-2 text-sm font-bold text-ink">Make my plan</Link>
      </main>
    );
  }

  const citIndex = new Map(plan.citations.map((c, i) => [c.id, i + 1]));
  const specs: DaySpec[] = trip?.days?.length
    ? trip.days
    : plan.days.map((d) => ({ dayIndex: d.dayIndex, label: d.label, date: "" }));
  const locked = new Map(plan.days.map((d) => [d.label, d]));
  const depDate = trip?.days?.find((d) => d.dayIndex === trip.departureDayIndex)?.date;
  const arrivalHref = trip
    ? `/arrival?origin=${trip.origin.code}&dest=${trip.destination.code}${depDate ? `&date=${depDate}` : ""}`
    : "/arrival";
  // The score wears its band — the gate's own PASS_SCORE, as words.
  const bandLine =
    scoreBand(plan.score) === "pass"
      ? "✓ Meets our sleep-science checks"
      : scoreBand(plan.score) === "warn"
        ? "Mostly meets our checks — a few steps aren't ideal"
        : "This plan didn't pass our checks — try making it again";
  const bandTone =
    scoreBand(plan.score) === "pass"
      ? "text-clay-pass"
      : scoreBand(plan.score) === "warn"
        ? "text-terracotta"
        : "text-clay-fail";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <PageHeader
        title="Your plan"
        actions={<span className={`text-xs font-bold ${bandTone}`}>{bandLine}</span>}
      />
      {trip && (
        <div className="-mt-4 mb-5 text-xs text-clay-2">
          {trip.origin.name} <span className="text-sun-dest">→</span> {trip.destination.name} ·{" "}
          {trip.destination.name} is {Math.abs(trip.requiredShiftMin / 60)}h{" "}
          {trip.direction === "east" ? "ahead" : "behind"}
        </div>
      )}

      <p className="font-voice max-w-3xl text-lg leading-relaxed text-clay">
        {planSummaryLine(plan.coverage, trip?.destination.name, plan.citations.length)}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={downloadIcs} className="rounded-lg bg-paper px-4 py-2 text-sm font-bold text-ink transition-colors hover:bg-white">Add to my calendar</button>
        <button onClick={downloadMarkdown} className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-sm font-bold text-paper transition-colors hover:border-mist">Download as text</button>
        <Link href={arrivalHref} className="rounded-lg border border-line bg-ink-2 px-4 py-2 text-sm text-mist transition-colors hover:text-paper">Rate my trip</Link>
        <ReplanLink trip={trip} />
        <button onClick={clearPlan} className="rounded-lg px-4 py-2 text-sm text-clay-2 transition-colors hover:text-clay-fail">Delete saved plan</button>
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-clay-2">Your week at a glance</h2>
          <p className="mt-1 text-xs leading-relaxed text-clay-2">
            Each row is a day. Your sleep moves a little{" "}
            {trip?.direction === "east" ? "earlier" : "later"} each day —
            that&apos;s your body clock adjusting.
          </p>
          <Card className="mt-3 h-[380px] overflow-hidden">
            <ShiftBoard days={specs} drafts={NO_DRAFTS} verdicts={NO_VERDICTS} locked={locked} readOnly rowLabel={(spec) => friendlyDayLabel(spec, trip?.departureDayIndex)} />
          </Card>

          <div className="mt-6 space-y-4">
            {plan.days.map((d) => (
              <Card key={d.dayIndex} className="p-4">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-bold text-paper">
                    {(() => {
                      const spec = trip?.days?.find((s) => s.label === d.label);
                      return spec ? friendlyDayLabel(spec, trip?.departureDayIndex) : d.label;
                    })()}
                  </h3>
                  {d.shiftMin !== 0 && (
                    <span className="font-mono2 text-xs text-mist">moves your body clock {Math.abs(d.shiftMin)} min</span>
                  )}
                </div>
                <div className="mt-1 font-mono2 text-xs text-mist">
                  Bed <span className="text-paper">{fmtMin(d.targetBedtimeMin)}</span> · Wake{" "}
                  <span className="text-paper">{fmtMin(d.targetWakeMin)}</span>
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
                            <span className="font-semibold">{INTERVENTION_LABELS[iv.kind] ?? iv.kind.replace(/_/g, " ")}</span>
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
          <h2 className="text-sm font-bold text-terracotta">The research behind it</h2>
          {plan.citations.length === 0 ? (
            <p className="mt-2 text-xs text-clay-2">No studies were needed for this plan.</p>
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
      {toast}
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
      Update plan with my check-ins
    </Link>
  );
}
