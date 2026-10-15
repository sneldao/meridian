"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { fmtMin } from "@/domain/circadian";
import type { Citation, DayPlan } from "@/domain/types";

interface Props {
  summary: string;
  score: number;
  citations: Citation[];
  days: DayPlan[];
  ics: string;
  onClose: () => void;
  fallback?: boolean;
}

export function BriefingCard({ summary, score, citations, days, ics, onClose, fallback }: Props) {
  // One action, not an information dump — surface the single next ask.
  const firstMove = days
    .flatMap((d) => d.interventions.map((iv) => ({ day: d, iv })))
    .find(({ iv }) => iv.kind === "light_exposure" || iv.kind === "sleep_window");

  const downloadIcs = () => {
    const blob = new Blob([ics], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "meridian-shift-plan.ics";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 90, damping: 16 }}
      className="absolute inset-x-8 bottom-8 z-10 rounded-2xl border border-[#ffc46b44] bg-[#0c1018f2] p-5 shadow-[0_0_80px_rgba(255,196,107,0.12)] backdrop-blur"
    >
      <button
        onClick={onClose}
        className="absolute top-3 right-3 rounded-md p-1 text-[#4a5470] transition-colors hover:bg-[#1e2637] hover:text-[#e8eaf2]"
        aria-label="Dismiss handoff"
      >
        <X size={14} />
      </button>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold tracking-[0.2em] text-[#ffc46b] uppercase">
            Morning handoff
          </div>
          {fallback && (
            <div className="mt-2 rounded-md border border-[#ff7a7a44] bg-[#ff7a7a11] px-2.5 py-1.5 text-[11px] text-[#ff7a7a]">
              Fell back to the recorded shift mid-run — review before acting.
            </div>
          )}
          <p className="mt-1.5 text-sm leading-relaxed text-[#e8eaf2]">{summary}</p>

          {firstMove && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-[#b8e35644] bg-[#b8e3560f] px-2.5 py-1 text-[11px] text-[#b8e356]">
              <span className="font-bold tracking-wider uppercase">first move</span>
              <span className="text-[#e8eaf2]">
                {firstMove.day.label} · {fmtMin(firstMove.iv.startMin)} — {firstMove.iv.note}
              </span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {days.map((d) => (
              <span key={d.dayIndex} className="rounded border border-[#1e2637] bg-[#131826] px-2 py-0.5 font-mono2 text-[10px] text-[#8b93a7]">
                {d.label} {d.shiftMin}m · bed {fmtMin(d.targetBedtimeMin)}
              </span>
            ))}
          </div>

          <div className="mt-3 space-y-0.5">
            {citations.slice(0, 4).map((c) => (
              <div key={c.id} className="truncate text-[10px] text-[#8b93a7]">
                <span className="text-[#b8e356]">▪</span>{" "}
                <a
                  href={c.doi ? `https://doi.org/${c.doi}` : c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#8b93a7] hover:text-[#b8e356] hover:underline"
                >
                  {c.title}
                </a>
                {c.year ? ` (${c.year})` : ""}
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="font-mono2 text-3xl font-bold text-[#b8e356]">{score.toFixed(2)}</div>
          <div className="text-[10px] tracking-widest text-[#8b93a7] uppercase">plan score</div>
          <button
            onClick={downloadIcs}
            className="mt-4 rounded-lg bg-[#ffc46b] px-4 py-2 text-xs font-bold text-[#07090f] transition-colors hover:bg-[#ffd98a]"
          >
            Add to calendar (.ics)
          </button>
        </div>
      </div>
    </motion.div>
  );
}
