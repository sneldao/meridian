"use client";

import { motion } from "framer-motion";
import { fmtMin } from "@/domain/circadian";
import type { Citation, DayPlan } from "@/domain/types";

interface Props {
  summary: string;
  score: number;
  citations: Citation[];
  days: DayPlan[];
  ics: string;
}

export function BriefingCard({ summary, score, citations, days, ics }: Props) {
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
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold tracking-[0.2em] text-[#ffc46b] uppercase">
            Morning handoff
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-[#e8eaf2]">{summary}</p>

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
                <span className="text-[#b8e356]">▪</span> {c.title}
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
