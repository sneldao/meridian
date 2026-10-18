"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { fmtMin } from "@/domain/circadian";
import { planSummaryLine } from "@/lib/plan-copy";
import { speakDialogue, speakOnce } from "@/lib/voice/engine";
import type { Citation, DayPlan, ShiftCoverage, VoiceLine } from "@/domain/types";

interface HandoffBannerProps {
  summary: string;
  score: number;
  citations: Citation[];
  days: DayPlan[];
  ics: string;
  lines?: VoiceLine[];
  coverage?: ShiftCoverage;
  fallback?: boolean;
  voiceAvailable?: boolean;
  /** Destination display name ("Tokyo") for the plain-language read. */
  destinationName?: string;
  /** Maps a domain day label ("D-2") to a friendly name ("Thu 22 Oct"). */
  dayName?: (label: string) => string;
  onDismiss?: () => void;
}

export function HandoffBanner({
  summary,
  citations,
  days,
  ics,
  lines,
  coverage,
  fallback,
  voiceAvailable,
  destinationName,
  dayName,
  onDismiss,
}: HandoffBannerProps) {
  const [voiceState, setVoiceState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const playGen = useRef(0);

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

  const listen = () => {
    if (voiceState === "loading" || voiceState === "playing") return;
    setVoiceState("loading");
    const my = ++playGen.current;
    const cbs = {
      onStart: () => {
        if (playGen.current === my) setVoiceState("playing");
      },
      onEnd: () => {
        if (playGen.current === my) setVoiceState("idle");
      },
    };
    if (lines?.length) speakDialogue(lines, cbs, true);
    else speakOnce(summary, "handoff", cbs, true);
    window.setTimeout(() => {
      if (playGen.current === my) setVoiceState((s) => (s === "loading" ? "error" : s));
    }, 12000);
  };

  const planLine = planSummaryLine(coverage, destinationName, citations.length);

  return (
    <section
      aria-label="Your plan is ready"
      className="relative overflow-hidden rounded-2xl border border-sun-dest/30 bg-gradient-to-br from-ink-3 via-ink-2 to-ink-2 p-5 shadow-lg"
    >
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-3.5 right-3.5 rounded-lg p-1.5 text-mist transition-colors hover:bg-line hover:text-paper"
          aria-label="Dismiss briefing summary"
        >
          <X size={15} />
        </button>
      )}

      <div className="flex flex-col justify-between gap-4 pr-6 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pass/15 px-2.5 py-0.5 text-xs font-bold text-pass">
              <CheckCircle2 size={12} />
              Your plan is ready
            </span>
          </div>

          {fallback && (
            <div className="mt-2 rounded-lg border border-fail/20 bg-fail/10 px-3 py-1.5 text-xs text-fail">
              Part of this plan used a backup schedule — double-check the times before adding it to your calendar.
            </div>
          )}

          <p className="mt-2.5 font-voice text-base leading-relaxed text-paper sm:text-lg">
            {planLine}
          </p>

          {firstMove && (
            <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-xl border border-pass/25 bg-pass/10 px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1 font-bold tracking-wider text-pass uppercase">
                <Sparkles size={12} />
                First step
              </span>
              <span className="font-mono2 font-semibold text-paper">
                {dayName?.(firstMove.day.label) ?? firstMove.day.label} at {fmtMin(firstMove.iv.startMin)}
              </span>
              <span className="text-mist">— {firstMove.iv.note}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-col md:items-end">
          <button
            type="button"
            onClick={downloadIcs}
            className="inline-flex items-center gap-2 rounded-xl bg-paper px-4 py-2.5 text-xs font-bold text-ink shadow-sm transition-colors hover:bg-white"
          >
            <CalendarPlus size={14} />
            Add to my calendar
          </button>

          {voiceAvailable && (
            <button
              type="button"
              onClick={listen}
              disabled={voiceState === "loading" || voiceState === "playing"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-ink-3 px-3.5 py-2 text-xs font-semibold text-paper transition-colors hover:border-mist disabled:opacity-50"
            >
              <Volume2 size={14} className="text-sun-dest" />
              {voiceState === "loading"
                ? "Preparing audio…"
                : voiceState === "playing"
                  ? "Playing…"
                  : voiceState === "error"
                    ? "Audio unavailable"
                    : "Listen"}
            </button>
          )}

          <Link
            href="/review"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-ink/60 px-3.5 py-2 text-xs font-medium text-mist transition-colors hover:border-mist hover:text-paper"
          >
            Printable plan
            <ExternalLink size={12} />
          </Link>
        </div>
      </div>
    </section>
  );
}
