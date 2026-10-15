"use client";

import { useEffect, useRef, useState } from "react";
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
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/api/voice")
      .then((r) => r.json())
      .then((d) => setVoiceEnabled(Boolean(d?.enabled)))
      .catch(() => {});
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const listen = async () => {
    if (voiceState === "loading" || voiceState === "playing") return;
    setVoiceState("loading");
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: summary }),
      });
      if (!res.ok) throw new Error("voice failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setVoiceState("idle");
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setVoiceState("error");
      };
      await audio.play();
      setVoiceState("playing");
    } catch {
      setVoiceState("error");
    }
  };

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
      className="absolute inset-x-8 bottom-8 z-10 rounded-2xl border border-sun-dest/27 bg-ink-2/95 p-5 shadow-[0_0_80px_rgba(255,196,107,0.12)] backdrop-blur"
    >
      <button
        onClick={onClose}
        className="absolute top-3 right-3 rounded-md p-1 text-dim transition-colors hover:bg-line hover:text-paper"
        aria-label="Dismiss handoff"
      >
        <X size={14} />
      </button>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-sun-dest">Morning handoff</div>
          {fallback && (
            <div className="mt-2 rounded-md border border-fail/27 bg-fail/7 px-2.5 py-1.5 text-[12px] text-fail">
              Fell back to the recorded shift mid-run — review before acting.
            </div>
          )}
          <p className="mt-1.5 text-sm leading-relaxed text-paper">{summary}</p>

          {firstMove && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-pass/27 bg-pass/6 px-2.5 py-1 text-[12px] text-pass">
              <span className="font-bold tracking-wider uppercase">first move</span>
              <span className="text-paper">
                {firstMove.day.label} · {fmtMin(firstMove.iv.startMin)} — {firstMove.iv.note}
              </span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {days.map((d) => (
              <span key={d.dayIndex} className="rounded border border-line bg-ink-3 px-2 py-0.5 font-mono2 text-[12px] text-mist">
                {d.label} {d.shiftMin}m · bed {fmtMin(d.targetBedtimeMin)}
              </span>
            ))}
          </div>

          <div className="mt-3 space-y-0.5">
            {citations.slice(0, 4).map((c) => (
              <div key={c.id} className="truncate text-[12px] text-mist">
                <span className="text-pass">▪</span>{" "}
                <a
                  href={c.doi ? `https://doi.org/${c.doi}` : c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-mist hover:text-pass hover:underline"
                >
                  {c.title}
                </a>
                {c.year ? ` (${c.year})` : ""}
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="font-mono2 text-3xl font-bold text-pass">{score.toFixed(2)}</div>
          <div
            className="text-[12px] text-mist"
            title="Mean of the passing eval verdicts across locked days — not the last day's score."
          >
            plan score · mean of {days.length} locked day{days.length === 1 ? "" : "s"}
          </div>
          <button
            onClick={downloadIcs}
            className="mt-4 rounded-lg bg-paper px-4 py-2 text-xs font-bold text-ink transition-colors hover:bg-white"
          >
            Add to calendar (.ics)
          </button>
          {voiceEnabled && (
            <button
              onClick={listen}
              disabled={voiceState === "loading" || voiceState === "playing"}
              className="mt-2 rounded-lg border border-paper/30 bg-paper/5 px-4 py-2 text-xs font-bold text-paper transition-colors hover:bg-paper/10 disabled:opacity-50"
            >
              {voiceState === "loading" ? "Generating voice…" : voiceState === "playing" ? "Playing…" : voiceState === "error" ? "Voice failed" : "Listen (ElevenLabs)"}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
