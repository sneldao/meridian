"use client";

import { useEffect, useState } from "react";
import type { CrewMemory } from "@/domain/types";
import Link from "next/link";

interface Outcome {
  savedAt: string;
  adherence: number; // 0..5
  jetlag: number; // 0..10
  notes: string;
}

export default function OutcomePage() {
  const [adherence, setAdherence] = useState(3);
  const [jetlag, setJetlag] = useState(3);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [memory, setMemory] = useState<CrewMemory | null>(null);

  useEffect(() => {
    fetch("/api/memory")
      .then((r) => r.json())
      .then(setMemory)
      .catch(() => {});
  }, []);

  const save = async () => {
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
      if (data.checkIn) {
        const prevCi = JSON.parse(localStorage.getItem("meridian:checkins") || "[]");
        prevCi.unshift(data.checkIn);
        localStorage.setItem("meridian:checkins", JSON.stringify(prevCi.slice(0, 100)));
      }
    } catch {
      /* ignore — check-in is best-effort */
    }
    setSaved(true);
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <Link href="/" className="text-[12px] text-[#8b93a7] hover:text-[#e8eaf2]">← deck</Link>
        <h1 className="mt-2 text-lg font-bold tracking-[0.3em] text-[#e8eaf2]">POST-TRIP CHECK-IN</h1>
      </header>

      <p className="text-sm leading-relaxed text-[#8b93a7]">
        Close the loop. These answers feed next run&apos;s adherence model.
      </p>

      <label className="mt-6 block text-[12px] text-[#8b93a7]">
        How much of the plan did you follow? ({adherence}/5)
        <input type="range" min={0} max={5} value={adherence} onChange={(e) => setAdherence(Number(e.target.value))} className="mt-2 w-full" />
      </label>

      <label className="mt-6 block text-[12px] text-[#8b93a7]">
        Jet lag severity on arrival day ({jetlag}/10)
        <input type="range" min={0} max={10} value={jetlag} onChange={(e) => setJetlag(Number(e.target.value))} className="mt-2 w-full" />
      </label>

      <label className="mt-6 block text-[12px] text-[#8b93a7]">
        Notes
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-lg border border-[#1e2637] bg-[#0c1018] p-2 text-[12px] text-[#e8eaf2]"
        />
      </label>

      <div className="mt-6 flex items-center gap-3">
        <button onClick={save} className="rounded-lg bg-[#b8e356] px-4 py-2 text-xs font-bold text-[#07090f]">
          Save check-in
        </button>
        {saved && <span className="text-[12px] text-[#b8e356]">saved</span>}
      </div>

      {memory?.learned && (
        <section className="mt-8 rounded-xl border border-[#1e2637] bg-[#0c1018] p-4">
          <h2 className="text-[12px] font-bold text-[#ffc46b]">What Meridian has learned</h2>
          {memory.learned.skippedKinds?.length ? (
            <div className="mt-2 text-[12px] text-[#8b93a7]">
              Historically difficult: {memory.learned.skippedKinds.join(", ")}
            </div>
          ) : null}
          {memory.learned.earliestDoneMin !== undefined ? (
            <div className="mt-1 text-[12px] text-[#8b93a7]">
              Earliest ask ever completed: {String(Math.floor(memory.learned.earliestDoneMin / 60)).padStart(2, "0")}:
              {String(memory.learned.earliestDoneMin % 60).padStart(2, "0")}
            </div>
          ) : null}
          {memory.learned.notes?.length ? (
            <ul className="mt-2 space-y-1">
              {memory.learned.notes.slice(-5).map((n: string, i: number) => (
                <li key={i} className="text-[12px] text-[#8b93a7]">“{n}”</li>
              ))}
            </ul>
          ) : null}
          {memory.runs?.length ? (
            <div className="mt-2 text-[12px] text-[#8b93a7]">{memory.runs.length} prior shift(s) on file.</div>
          ) : null}
        </section>
      )}
    </main>
  );
}