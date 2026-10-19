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
      if (data.checkIn) {
        const prevCi = JSON.parse(
          localStorage.getItem("meridian:checkins") || "[]",
        );
        prevCi.unshift(data.checkIn);
        localStorage.setItem(
          "meridian:checkins",
          JSON.stringify(prevCi.slice(0, 100)),
        );
      }
    } catch {
      /* ignore */
    }
    setSaved(true);
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-8 text-[#1E1B18]">
      <header className="mb-6 rounded-[24px] border border-[#e3d5c3] bg-[#FFF8EF] p-5">
        <Link
          href="/"
          className="inline-block rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-3 py-1 text-xs font-bold text-[#1E1B18] hover:border-[#D96B43]"
        >
          ← Back to 24h Dial
        </Link>
        <h1 className="mt-3 text-lg font-extrabold tracking-[0.25em] text-[#1E1B18]">
          SLEEP &amp; ADHERENCE CHECK-IN
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-[#5b4d41]">
          Close the loop ("You told us"). Your self-reported adherence feeds
          the next run&apos;s replan without penalty.
        </p>
      </header>

      <div className="space-y-5 rounded-[24px] border border-[#e3d5c3] bg-[#FFF8EF] p-6">
        <label className="block text-xs font-bold text-[#1E1B18]">
          How much of the planned windows did you follow? ({adherence}/5)
          <input
            type="range"
            min={0}
            max={5}
            value={adherence}
            onChange={(e) => setAdherence(Number(e.target.value))}
            className="mt-2 w-full accent-[#D96B43]"
          />
        </label>

        <label className="block text-xs font-bold text-[#1E1B18]">
          Perceived circadian strain / jet lag ({jetlag}/10)
          <input
            type="range"
            min={0}
            max={10}
            value={jetlag}
            onChange={(e) => setJetlag(Number(e.target.value))}
            className="mt-2 w-full accent-[#D96B43]"
          />
        </label>

        <label className="block text-xs font-bold text-[#1E1B18]">
          Notes (e.g., &ldquo;Skipped morning light&rdquo; or &ldquo;Dinner ran late&rdquo;)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-xl border border-[#d8c6ae] bg-[#f5efe6] p-3 text-xs text-[#1E1B18]"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            className="rounded-full bg-[#D96B43] px-5 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#c45a34]"
          >
            Save check-in
          </button>
          {saved && (
            <span className="rounded-full bg-[#E8F5EE] px-3 py-1 text-xs font-extrabold text-[#1B4D35]">
              ✓ Saved to adherence memory
            </span>
          )}
        </div>
      </div>

      {memory?.learned && (
        <div className="mt-6 rounded-[24px] border border-[#e3d5c3] bg-[#FFF8EF] p-5">
          <h2 className="text-sm font-extrabold text-[#1E1B18]">
            What Meridian has learned (Graph Memory)
          </h2>
          {memory.learned.skippedKinds?.length ? (
            <div className="mt-2 text-xs text-[#5b4d41]">
              Historically difficult windows:{" "}
              {memory.learned.skippedKinds.join(", ")}
            </div>
          ) : null}
          {memory.learned.earliestDoneMin !== undefined ? (
            <div className="mt-1 text-xs text-[#5b4d41]">
              Earliest window completed:{" "}
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
              {memory.runs.length} prior shift(s) on file.
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
