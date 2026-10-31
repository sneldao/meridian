"use client";

import { useEffect, useState } from "react";
import type { CrewMemory } from "@/domain/types";
import Link from "next/link";
import { Card } from "@/components/ui";
import { BottomNav } from "@/components/BottomNav";
import { PageHeader } from "@/components/PageHeader";
import { INTERVENTION_LABELS } from "@/lib/intervention-icons";

interface Outcome {
  savedAt: string;
  adherence: number; // 0..5
  jetlag: number; // 0..10
  notes: string;
}

export default function OutcomePage() {
  // Sliders start unset — a saved report must be answers, not defaults.
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
    // localStorage read deferred — keeps setState out of the effect body and
    // the gate off the first paint (client-only state either way).
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
    const o: Outcome = { savedAt: new Date().toISOString(), adherence, jetlag, notes };
    try {
      const prev = JSON.parse(localStorage.getItem("meridian:outcomes") || "[]");
      prev.unshift(o);
      localStorage.setItem("meridian:outcomes", JSON.stringify(prev.slice(0, 50)));
    } catch {}
    // Structure the free text into a CheckIn that later runs can fold into
    // the adherence profile (morning-shift replan).
    try {
      const res = await fetch("/api/crew/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: notes, status: adherence <= 1 ? "skipped" : adherence >= 4 ? "done" : "partial" }),
      });
      const data = (await res.json()) as { checkIn?: unknown };
      if (!res.ok || !data.checkIn) {
        setSaved("local"); // the traveller's record kept; the crew didn't get it
        return;
      }
      const prevCi = JSON.parse(localStorage.getItem("meridian:checkins") || "[]");
      prevCi.unshift(data.checkIn);
      localStorage.setItem("meridian:checkins", JSON.stringify(prevCi.slice(0, 100)));
      setSaved("crew");
    } catch {
      setSaved("local");
    }
  };

  const chip = (selected: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
      selected
        ? "border-terracotta bg-terracotta text-paper"
        : "border-line bg-ink-2 text-mist hover:text-paper"
    }`;

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <PageHeader title="How did your trip go?" />

      <p className="text-sm leading-relaxed text-mist">
        Two quick questions — answers shape your next plan.
      </p>

      {hasPlan === false ? (
        <Card className="mt-6 p-4">
          <p className="text-xs leading-relaxed text-mist">
            Nothing to rate yet — make a plan and follow it first.
          </p>
          <Link href="/" className="mt-3 inline-block text-xs font-bold text-paper hover:text-white">
            ← Back to my plan
          </Link>
        </Card>
      ) : (
        <>
          <fieldset className="mt-6">
            <legend className="text-xs text-mist">How much of the plan did you follow?</legend>
            <div role="radiogroup" className="mt-2 flex flex-wrap gap-2">
              {([
                ["None", 0],
                ["A little", 1],
                ["About half", 3],
                ["Most", 4],
                ["All", 5],
              ] as const).map(([label, v]) => (
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

          <fieldset className="mt-6">
            <legend className="text-xs text-mist">How bad was the jet lag on your first day?</legend>
            <div role="radiogroup" className="mt-2 flex flex-wrap gap-2">
              {([
                ["None", 0],
                ["Mild", 3],
                ["Moderate", 5],
                ["Bad", 7],
                ["Terrible", 10],
              ] as const).map(([label, v]) => (
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

          <label className="mt-6 block text-xs text-mist">
            Anything else? (optional)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="e.g. I couldn't get outside in the mornings"
              className="mt-2 w-full rounded-lg border border-line bg-ink-2 p-2 text-xs text-paper"
            />
          </label>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={save}
              disabled={adherence === null || jetlag === null}
              className="rounded-lg bg-paper px-4 py-2 text-xs font-bold text-ink hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
            {saved === "crew" && <span className="text-xs text-pass">Thanks — we&apos;ll use this for your next plan.</span>}
            {saved === "local" && (
              <span className="text-xs text-mist">Saved on this device. We couldn&apos;t reach the server, so it won&apos;t shape your next plan yet.</span>
            )}
          </div>
        </>
      )}

      {memory?.learned && (
        <Card className="mt-8 p-4">
          <h2 className="text-sm font-bold text-paper">What we&apos;ve learned about you</h2>
          {memory.learned.skippedKinds?.length ? (
            <div className="mt-2 text-xs text-mist">
              Harder for you:{" "}
              {memory.learned.skippedKinds
                .map((k) => INTERVENTION_LABELS[k] ?? k.replace(/_/g, " "))
                .join(", ")}
            </div>
          ) : null}
          {memory.learned.earliestDoneMin !== undefined ? (
            <div className="mt-1 text-xs text-mist">
              Earliest step you&apos;ve done: {String(Math.floor(memory.learned.earliestDoneMin / 60)).padStart(2, "0")}:
              {String(memory.learned.earliestDoneMin % 60).padStart(2, "0")}
            </div>
          ) : null}
          {memory.learned.notes?.length ? (
            <ul className="mt-2 space-y-1">
              {memory.learned.notes.slice(-5).map((n: string, i: number) => (
                <li key={i} className="text-xs text-mist">“{n}”</li>
              ))}
            </ul>
          ) : null}
          {memory.runs?.length ? (
            <div className="mt-2 text-xs text-mist">{memory.runs.length} past plan(s) on file.</div>
          ) : null}
        </Card>
      )}
      <BottomNav />
    </main>
  );
}