"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtMin } from "@/domain/circadian";
import { scoreBand } from "@/domain/score";
import type { Citation, DayPlan, DaySpec, EvalResult, ShiftCoverage } from "@/domain/types";
import { INTERVENTION_ICONS, INTERVENTION_LABELS } from "@/lib/intervention-icons";
import { friendlyDayLabel } from "@/lib/day-label";
import { planSummaryLine } from "@/lib/plan-copy";
import { useUndoToast } from "@/components/UndoToast";
import { SubscribeCalendar } from "@/components/SubscribeCalendar";
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
  days?: DaySpec[];
}

const PLAN_KEY = "meridian:lastPlan";
const TRIP_KEY = "meridian:lastTrip";

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
    if (trip) {
      lines.push(
        `**Route:** ${trip.origin.name} (${trip.origin.code}) → ${trip.destination.name} (${trip.destination.code}) · ${trip.destination.name} is ${Math.abs(trip.requiredShiftMin / 60)}h ${trip.direction === "east" ? "ahead" : "behind"}`,
      );
    }
    lines.push(`**Verification:** CHECKED against schedule & shift rate limits`);
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
        lines.push(
          `- **${INTERVENTION_LABELS[iv.kind] ?? iv.kind.replace(/_/g, " ")}** ${fmtMin(iv.startMin)}${iv.endMin ? `–${fmtMin(iv.endMin)}` : ""} — ${iv.note}${cit ? ` (${cit.title}${cit.year ? `, ${cit.year}` : ""})` : ""}`,
        );
      }
      lines.push("");
    }
    if (plan.citations.length) {
      lines.push("## The research behind it");
      for (const c of plan.citations) {
        lines.push(
          `- ${c.title}${c.year ? ` (${c.year})` : ""}${c.venue ? ` — ${c.venue}` : ""}${c.doi ? ` — https://doi.org/${c.doi}` : c.url ? ` — ${c.url}` : ""}`,
        );
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
    return (
      <main className="flex min-h-screen items-center justify-center text-xs font-semibold text-[#7a6a5c]">
        Loading…
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12 text-center text-[#1E1B18]">
        <div className="rounded-[28px] border border-[#e3d5c3] bg-[#FFF8EF] p-8 shadow-sm">
          <h1 className="text-lg font-extrabold tracking-[0.28em] text-[#1E1B18]">
            MERIDIAN
          </h1>
          <p className="mt-3 text-sm text-[#5b4d41]">
            No saved plan yet. Make your plan on the home page and it&apos;ll be saved here.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-[#D96B43] px-5 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#c45a34]"
          >
            ← Make my plan
          </Link>
        </div>
        {toast}
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

  const band = scoreBand(plan.score);
  const bandLine =
    band === "pass"
      ? "✓ CHECKED · Meets sleep-science checks"
      : band === "warn"
        ? "Mostly meets our checks — a few steps aren't ideal"
        : "Needs review — try making it again";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 text-[#1E1B18]">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-[24px] border border-[#e3d5c3] bg-[#FFF8EF] p-5">
        <div>
          <Link
            href="/"
            className="inline-block rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-3 py-1 text-xs font-bold text-[#1E1B18] hover:border-[#D96B43]"
          >
            ← Back to my plan
          </Link>
          <h1 className="mt-3 text-xl font-extrabold tracking-[0.2em] text-[#1E1B18]">
            YOUR SAVED CIRCADIAN PLAN
          </h1>
          {trip && (
            <div className="mt-1 font-mono2 text-xs font-bold text-[#5b4d41]">
              {trip.origin.name} ({trip.origin.code}){" "}
              <span className="text-[#D96B43]">→</span>{" "}
              {trip.destination.name} ({trip.destination.code}) · {trip.destination.name} is{" "}
              {Math.abs(trip.requiredShiftMin / 60)}h{" "}
              {trip.direction === "east" ? "ahead" : "behind"}
            </div>
          )}
        </div>
        <div className="text-right">
          <span className="inline-block rounded-full border border-[#2A6F4E] bg-[#E8F5EE] px-3 py-1 text-xs font-extrabold text-[#1B4D35]">
            {bandLine}
          </span>
        </div>
      </header>

      <p className="max-w-3xl text-base font-medium leading-relaxed text-[#1E1B18]">
        {planSummaryLine(plan.coverage, trip?.destination.name, plan.citations.length)}
      </p>
      {plan.summary && (
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-[#5b4d41]">
          {plan.summary}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={downloadIcs}
          className="rounded-full bg-[#D96B43] px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#c45a34]"
        >
          Add to my calendar (.ics)
        </button>
        <SubscribeCalendar
          ics={plan.ics}
          trip={trip}
          days={plan.days}
          className="rounded-full border border-[#1E1B18] bg-[#FFF8EF] px-4 py-2 text-xs font-extrabold text-[#1E1B18] transition hover:bg-[#1E1B18] hover:text-[#F5EFE6]"
        />
        <button
          onClick={downloadMarkdown}
          className="rounded-full border border-[#1E1B18] bg-[#FFF8EF] px-4 py-2 text-xs font-extrabold text-[#1E1B18] transition hover:bg-[#1E1B18] hover:text-[#F5EFE6]"
        >
          Download as text (.md)
        </button>
        <Link
          href="/outcome"
          className="rounded-full border border-[#d8c6ae] bg-[#FFF8EF] px-4 py-2 text-xs font-bold text-[#1E1B18] transition hover:border-[#D96B43]"
        >
          Log sleep check-in
        </Link>
        <Link
          href={arrivalHref}
          className="rounded-full border border-[#d8c6ae] bg-[#FFF8EF] px-4 py-2 text-xs font-bold text-[#1E1B18] transition hover:border-[#D96B43]"
        >
          Arrival score
        </Link>
        <ReplanLink trip={trip} />
        <button
          onClick={clearPlan}
          className="rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-4 py-2 text-xs font-bold text-[#5b4d41] transition hover:border-[#B91C1C] hover:text-[#B91C1C]"
        >
          Delete saved plan
        </button>
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#1E1B18]">
            Your week at a glance
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#5b4d41]">
            Each row is a day. Your sleep moves a little{" "}
            {trip?.direction === "east" ? "earlier" : "later"} each day —
            that&apos;s your body clock adjusting.
          </p>
          <div className="mt-3 h-[380px] overflow-hidden rounded-2xl border border-[#e3d5c3] bg-[#07090f] p-2 text-[#e8eaf2]">
            <ShiftBoard
              days={specs}
              drafts={NO_DRAFTS}
              verdicts={NO_VERDICTS}
              locked={locked}
              readOnly
              rowLabel={(spec) => friendlyDayLabel(spec, trip?.departureDayIndex)}
            />
          </div>

          <div className="mt-6 space-y-4">
            {plan.days.map((d) => {
              const spec = trip?.days?.find((s) => s.label === d.label);
              const friendly = spec
                ? friendlyDayLabel(spec, trip?.departureDayIndex)
                : d.label;
              return (
                <div
                  key={d.dayIndex}
                  className="rounded-[22px] border border-[#e3d5c3] bg-[#FFF8EF] p-5"
                >
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-base font-extrabold text-[#1E1B18]">
                      {friendly}
                    </h3>
                    {d.shiftMin !== 0 && (
                      <span className="rounded-full bg-[#f6dccb] px-2.5 py-0.5 font-mono2 text-xs font-bold text-[#a8431e]">
                        moves body clock {Math.abs(d.shiftMin)} min
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex gap-4 font-mono2 text-xs text-[#5b4d41]">
                    <span>
                      Bed{" "}
                      <strong className="text-[#1E1B18]">
                        {fmtMin(d.targetBedtimeMin)}
                      </strong>
                    </span>
                    <span>
                      Wake{" "}
                      <strong className="text-[#1E1B18]">
                        {fmtMin(d.targetWakeMin)}
                      </strong>
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2.5">
                    {d.interventions.map((iv, j) => {
                      const IconInfo = INTERVENTION_ICONS[iv.kind];
                      const ref = iv.citationId
                        ? citIndex.get(iv.citationId)
                        : undefined;
                      const Icon = IconInfo?.icon;
                      return (
                        <li key={j} className="flex gap-3">
                          <span
                            className="mt-0.5 shrink-0"
                            style={{ color: "#D96B43" }}
                          >
                            {Icon ? <Icon size={14} strokeWidth={2.2} /> : null}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-[#1E1B18]">
                              <span>
                                {INTERVENTION_LABELS[iv.kind] ?? iv.kind.replace(/_/g, " ")}
                              </span>
                              <span className="ml-2 font-mono2 text-xs text-[#5b4d41]">
                                {fmtMin(iv.startMin)}
                                {iv.endMin ? `–${fmtMin(iv.endMin)}` : ""}
                              </span>
                              {ref && (
                                <sup className="ml-1 font-mono2 text-xs text-[#D96B43]">
                                  [{ref}]
                                </sup>
                              )}
                            </div>
                            <div className="text-xs leading-relaxed text-[#5b4d41]">
                              {iv.note}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="rounded-[22px] border border-[#e3d5c3] bg-[#FFF8EF] p-5 lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#D96B43]">
            The research behind it
          </h2>
          {plan.citations.length === 0 ? (
            <p className="mt-2 text-xs text-[#5b4d41]">
              No studies were needed for this plan.
            </p>
          ) : (
            <ol className="mt-3 space-y-2.5">
              {plan.citations.map((c, i) => (
                <li
                  key={c.id}
                  className="flex gap-2 text-xs leading-relaxed text-[#5b4d41]"
                >
                  <span className="font-mono2 font-bold text-[#1E1B18]">
                    {i + 1}.
                  </span>
                  <span className="min-w-0">
                    <a
                      href={c.doi ? `https://doi.org/${c.doi}` : c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[#1E1B18] underline decoration-[#D96B43] hover:text-[#D96B43]"
                    >
                      {c.title}
                    </a>
                    {c.year ? ` (${c.year})` : ""}
                    {c.venue ? ` · ${c.venue}` : ""}
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
    const checkIns = JSON.parse(
      localStorage.getItem("meridian:checkins") || "[]",
    );
    if (checkIns.length) {
      const params = new URLSearchParams();
      if (trip?.origin?.code) params.set("origin", trip.origin.code);
      if (trip?.destination?.code) params.set("dest", trip.destination.code);
      params.set("checkins", btoa(JSON.stringify(checkIns)));
      params.set("startDay", "0");
      href = "/?" + params.toString();
    }
  } catch {
    /* ignore */
  }
  if (href === "/") return null;
  return (
    <Link
      href={href}
      className="rounded-full border border-[#1E1B18] bg-[#FFF8EF] px-4 py-2 text-xs font-bold text-[#1E1B18] transition hover:bg-[#1E1B18] hover:text-[#F5EFE6]"
    >
      Update plan with my check-ins
    </Link>
  );
}
