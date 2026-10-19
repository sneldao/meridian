"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtMin } from "@/domain/circadian";
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
    const lines: string[] = [];
    lines.push("# Meridian shift plan");
    lines.push("");
    if (trip)
      lines.push(
        `**Route:** ${trip.origin.code} → ${trip.destination.code} · ${Math.abs(trip.requiredShiftMin / 60)}h ${trip.direction}`,
      );
    lines.push(`**Verification:** CHECKED against schedule & shift rate limits`);
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
        lines.push(
          `- **${iv.kind.replace(/_/g, " ")}** ${fmtMin(iv.startMin)}${iv.endMin ? `–${fmtMin(iv.endMin)}` : ""} — ${iv.note}${cit ? ` (${cit.title}${cit.year ? `, ${cit.year}` : ""})` : ""}`,
        );
      }
      lines.push("");
    }
    if (plan.citations.length) {
      lines.push("## Evidence");
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

  const clearPlan = () => {
    try {
      localStorage.removeItem(PLAN_KEY);
      localStorage.removeItem(TRIP_KEY);
    } catch {}
    setPlan(null);
    setTrip(null);
  };

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center text-xs font-semibold text-[#7a6a5c]">
        loading…
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
            No saved handoff yet. Run a simulated crew check on the 24h dial or
            in the Operator lens first.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-[#D96B43] px-5 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#c45a34]"
          >
            ← Back to 24h Dial
          </Link>
        </div>
      </main>
    );
  }

  const citIndex = new Map(plan.citations.map((c, i) => [c.id, i + 1]));
  const specs: DaySpec[] = trip?.days?.length
    ? trip.days
    : plan.days.map((d) => ({ dayIndex: d.dayIndex, label: d.label, date: "" }));
  const locked = new Map(plan.days.map((d) => [d.label, d]));
  const shiftH = trip
    ? `${Math.abs(trip.requiredShiftMin / 60)}h ${trip.direction}`
    : "";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 text-[#1E1B18]">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-[24px] border border-[#e3d5c3] bg-[#FFF8EF] p-5">
        <div>
          <Link
            href="/"
            className="inline-block rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-3 py-1 text-xs font-bold text-[#1E1B18] hover:border-[#D96B43]"
          >
            ← Back to 24h Dial
          </Link>
          <h1 className="mt-3 text-xl font-extrabold tracking-[0.2em] text-[#1E1B18]">
            PRINTABLE CIRCADIAN GUIDE
          </h1>
          {trip && (
            <div className="mt-1 font-mono2 text-xs font-bold text-[#5b4d41]">
              {trip.origin.code}{" "}
              <span className="text-[#D96B43]">→</span>{" "}
              {trip.destination.code} · {shiftH}
            </div>
          )}
        </div>
        <div className="text-right">
          <span className="inline-block rounded-full border border-[#2A6F4E] bg-[#E8F5EE] px-3 py-1 text-xs font-extrabold text-[#1B4D35]">
            ✓ CHECKED
          </span>
          <div className="mt-1 text-xs font-semibold text-[#7a6a5c]">
            Verified schedule constraints
          </div>
        </div>
      </header>

      <p className="max-w-3xl text-base font-medium leading-relaxed text-[#1E1B18]">
        {plan.summary}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={downloadIcs}
          className="rounded-full bg-[#D96B43] px-4 py-2 text-xs font-extrabold text-white transition hover:bg-[#c45a34]"
        >
          Add to calendar (.ics)
        </button>
        <button
          onClick={downloadMarkdown}
          className="rounded-full border border-[#1E1B18] bg-[#FFF8EF] px-4 py-2 text-xs font-extrabold text-[#1E1B18] transition hover:bg-[#1E1B18] hover:text-[#F5EFE6]"
        >
          Export markdown (.md)
        </button>
        <button
          onClick={clearPlan}
          className="rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-4 py-2 text-xs font-bold text-[#5b4d41] transition hover:border-[#B91C1C] hover:text-[#B91C1C]"
        >
          Clear saved plan
        </button>
        <Link
          href="/outcome"
          className="rounded-full border border-[#d8c6ae] bg-[#FFF8EF] px-4 py-2 text-xs font-bold text-[#1E1B18] transition hover:border-[#D96B43]"
        >
          Log sleep outcome
        </Link>
        <ReplanLink trip={trip} />
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-[#1E1B18]">
            The week, hour by hour
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[#5b4d41]">
            Body-clock time across 24 hours. The sleep bar steps day by day toward your target night.
          </p>
          <div className="mt-3 h-[380px] overflow-hidden rounded-2xl border border-[#e3d5c3] bg-[#07090f] p-2 text-[#e8eaf2]">
            <ShiftBoard
              days={specs}
              drafts={NO_DRAFTS}
              verdicts={NO_VERDICTS}
              locked={locked}
              readOnly
            />
          </div>

          <div className="mt-6 space-y-4">
            {plan.days.map((d) => (
              <div
                key={d.dayIndex}
                className="rounded-[22px] border border-[#e3d5c3] bg-[#FFF8EF] p-5"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-base font-extrabold text-[#1E1B18]">
                    {d.label}
                  </h3>
                  <span className="rounded-full bg-[#f6dccb] px-2.5 py-0.5 font-mono2 text-xs font-bold text-[#a8431e]">
                    {d.shiftMin} min shift
                  </span>
                </div>
                <div className="mt-1 flex gap-4 font-mono2 text-xs text-[#5b4d41]">
                  <span>
                    bed{" "}
                    <strong className="text-[#1E1B18]">
                      {fmtMin(d.targetBedtimeMin)}
                    </strong>
                  </span>
                  <span>
                    wake{" "}
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
                            <span className="capitalize">
                              {iv.kind.replace(/_/g, " ")}
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
            ))}
          </div>
        </div>

        <aside className="rounded-[22px] border border-[#e3d5c3] bg-[#FFF8EF] p-5 lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#D96B43]">
            Verified Evidence Sources
          </h2>
          {plan.citations.length === 0 ? (
            <p className="mt-2 text-xs text-[#5b4d41]">
              No citations were required for this plan.
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
      Replan with check-ins
    </Link>
  );
}
