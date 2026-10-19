"use client";

import { useEffect, useState } from "react";
import type { CrewMemory } from "@/domain/types";
import Link from "next/link";
import { INTERVENTION_LABELS } from "@/lib/intervention-icons";

interface Outcome {
  savedAt: string;
  adherence: number; // 0..5
  jetlag: number; // 0..10
  notes: string;
}

export default function OutcomePage() {
  // Start unset so a saved report reflects explicit user answers.
  const [adherence, setAdherence] = useState<number | null>(null);
  const [jetlag, setJetlag] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState<null | "crew" | "local">(null);
  const [memory, setMemory] = useState<CrewMemory | null>(null);
  const [hasPlan, setHasPlan] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/memory")
      .then((r) => r.json())
      .then(setMemory)
      .catch(() => {});
    const t = setTimeout(() => {
      try {
        setHasPlan(Boolean(localStorage.getItem("meridian:lastPlan")));
      } catch {
        setHasPlan(false);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const save = async () => {
    if (adherence === null || jetlag === null) return;
    const o: Outcome = {
      savedAt: new Date().toISOString(),
      adherence,
      jetlag,
      notes,
    };
    try {
      const prev = JSON.parse(
        localStorage.getItem("meridian:outcomes") || "[]",
      );
      prev.unshift(o);
      localStorage.setItem(
        "meridian:outcomes",
        JSON.stringify(prev.slice(0, 50)),
      );
    } catch {}
    try {
      const res = await fetch("/api/crew/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: notes,
          status:
            adherence <= 1 ? "skipped" : adherence >= 4 ? "done" : "partial",
        }),
      });
      const data = (await res.json()) as { checkIn?: unknown };
      if (!res.ok || !data.checkIn) {
        setSaved("local");
        return;
      }
      const prevCi = JSON.parse(
        localStorage.getItem("meridian:checkins") || "[]",
      );
      prevCi.unshift(data.checkIn);
      localStorage.setItem(
        "meridian:checkins",
        JSON.stringify(prevCi.slice(0, 100)),
      );
      setSaved("crew");
    } catch {
      setSaved("local");
    }
  };

  const chip = (selected: boolean) =>
    `rounded-full border px-4 py-2 text-xs font-extrabold transition-colors ${
      selected
        ? "border-[#D96B43] bg-[#D96B43] text-white shadow-sm"
        : "border-[#d8c6ae] bg-[#f5efe6] text-[#1E1B18] hover:border-[#D96B43]"
    }`;

  return (
    <main className="mx-auto max-w-2xl px-6 py-8 text-[#1E1B18]">
      <header className="mb-6 rounded-[24px] border border-[#e3d5c3] bg-[#FFF8EF] p-5">
        <Link
          href="/"
          className="inline-block rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-3 py-1 text-xs font-bold text-[#1E1B18] hover:border-[#D96B43]"
        >
          ← Back to my plan
        </Link>
        <h1 className="mt-3 text-lg font-extrabold tracking-[0.2em] text-[#1E1B18]">
          HOW DID YOUR TRIP GO?
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-[#5b4d41]">
          Two quick questions (&ldquo;You told us&rdquo;). Your answers help fit
          your next plan better without penalty.
        </p>
      </header>

      {hasPlan === false && (
        <div className="mb-5 rounded-[22px] border border-[#e3d5c3] bg-[#FFF8EF] p-4 text-xs text-[#5b4d41]">
          Tip: You haven&apos;t saved a plan on this device yet, or you can log a
          check-in below anytime.
        </div>
      )}

      <div className="space-y-6 rounded-[24px] border border-[#e3d5c3] bg-[#FFF8EF] p-6">
        <fieldset>
          <legend className="text-xs font-bold text-[#1E1B18]">
            How much of the plan did you follow?
          </legend>
          <div role="radiogroup" className="mt-2.5 flex flex-wrap gap-2">
            {(
              [
                ["None", 0],
                ["A little", 1],
                ["About half", 3],
                ["Most", 4],
                ["All", 5],
              ] as const
            ).map(([label, v]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={adherence === v}
                onClick={() => setAdherence(v)}
                className={chip(adherence === v)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-bold text-[#1E1B18]">
            How bad was the jet lag on your first day?
          </legend>
          <div role="radiogroup" className="mt-2.5 flex flex-wrap gap-2">
            {(
              [
                ["None", 0],
                ["Mild", 3],
                ["Moderate", 5],
                ["Bad", 7],
                ["Terrible", 10],
              ] as const
            ).map(([label, v]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={jetlag === v}
                onClick={() => setJetlag(v)}
                className={chip(jetlag === v)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block text-xs font-bold text-[#1E1B18]">
          Anything else? (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="e.g. I couldn't get outside in the mornings, or dinner ran late"
            className="mt-2 w-full rounded-xl border border-[#d8c6ae] bg-[#f5efe6] p-3 text-xs text-[#1E1B18]"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={adherence === null || jetlag === null}
            className="rounded-full bg-[#D96B43] px-5 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#c45a34] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save check-in
          </button>
          {saved === "crew" && (
            <span className="rounded-full bg-[#E8F5EE] px-3 py-1 text-xs font-extrabold text-[#1B4D35]">
              ✓ Thanks — we&apos;ll use this for your next plan
            </span>
          )}
          {saved === "local" && (
            <span className="rounded-full bg-[#f6dccb] px-3 py-1 text-xs font-bold text-[#a8431e]">
              Saved on this device
            </span>
          )}
        </div>
      </div>

      {memory?.learned && (
        <div className="mt-6 rounded-[24px] border border-[#e3d5c3] bg-[#FFF8EF] p-5">
          <h2 className="text-sm font-extrabold text-[#1E1B18]">
            What we&apos;ve learned about you (Graph Memory)
          </h2>
          {memory.learned.skippedKinds?.length ? (
            <div className="mt-2 text-xs text-[#5b4d41]">
              Harder windows for you:{" "}
              {memory.learned.skippedKinds
                .map((k) => INTERVENTION_LABELS[k] ?? k.replace(/_/g, " "))
                .join(", ")}
            </div>
          ) : null}
          {memory.learned.earliestDoneMin !== undefined ? (
            <div className="mt-1 text-xs text-[#5b4d41]">
              Earliest step you&apos;ve done:{" "}
              {String(Math.floor(memory.learned.earliestDoneMin / 60)).padStart(
                2,
                "0",
              )}
              :
              {String(memory.learned.earliestDoneMin % 60).padStart(2, "0")}
            </div>
          ) : null}
          {memory.learned.notes?.length ? (
            <ul className="mt-2 space-y-1">
              {memory.learned.notes.slice(-5).map((n: string, i: number) => (
                <li key={i} className="text-xs text-[#5b4d41]">
                  “{n}”
                </li>
              ))}
            </ul>
          ) : null}
          {memory.runs?.length ? (
            <div className="mt-2 text-xs text-[#7a6a5c]">
              {memory.runs.length} past plan(s) on file.
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
