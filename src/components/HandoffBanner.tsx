"use client";

import Link from "next/link";
import { useRef, useState } from "react";
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
import { SubscribeCalendar } from "@/components/SubscribeCalendar";
import { speakDialogue, speakOnce } from "@/lib/voice/engine";
import type { Citation, DayPlan, ShiftCoverage, Trip, VoiceLine } from "@/domain/types";

interface HandoffBannerProps {
  /** Needed to publish the webcal feed. */
  trip?: Trip | null;
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
  trip,
  summary,
  days,
  citations,
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

  const firstMove = (() => {
    for (const day of days) {
      const iv = day.interventions[0];
      if (iv) return { day, iv };
    }
    return null;
  })();

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

  const shiftHoursSummary = coverage
    ? `${(coverage.achievedMin / 60).toFixed(1)}h of ${(coverage.requiredMin / 60).toFixed(1)}h planned shift scheduled`
    : `${days.length} days checked against constraints`;
  const planLine = planSummaryLine(coverage, destinationName, citations.length);

  return (
    <section
      aria-label="Your personalized circadian handoff"
      className="relative overflow-hidden rounded-[24px] border border-[#e3d5c3] bg-[#FFF8EF] p-5 text-[#1E1B18] shadow-[0_20px_44px_-22px_rgba(30,27,24,0.22)]"
    >
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-3.5 right-3.5 rounded-full p-1.5 text-[#7a6a5c] transition-colors hover:bg-[#efe2d0] hover:text-[#1E1B18]"
          aria-label="Dismiss briefing summary"
        >
          <X size={15} />
        </button>
      )}

      <div className="flex flex-col justify-between gap-4 pr-6 md:flex-row md:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F5EE] px-3 py-0.5 text-xs font-extrabold text-[#1B4D35]">
              <CheckCircle2 size={12} />
              CHECKED · Schedule Verified
            </span>
            <span className="rounded-full bg-[#f6dccb] px-2.5 py-0.5 text-xs font-bold text-[#a8431e]">
              {shiftHoursSummary}
            </span>
          </div>

          {fallback && (
            <div className="mt-2 rounded-xl border border-[#B91C1C]/30 bg-[#FEF2F2] px-3 py-1.5 text-xs font-semibold text-[#7F1D1D]">
              Part of this plan used a verified backup schedule — double-check the times before adding it to your calendar.
            </div>
          )}

          <p className="mt-2.5 text-base font-semibold leading-relaxed text-[#1E1B18]">
            {summary || planLine}
          </p>
          {summary && planLine && summary !== planLine && (
            <p className="mt-1 text-xs leading-relaxed text-[#5b4d41]">
              {planLine}
            </p>
          )}

          {firstMove && (
            <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-xl border border-[#e3d5c3] bg-[#f5efe6] px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1 font-extrabold tracking-wider text-[#D96B43] uppercase">
                <Sparkles size={12} />
                First Action
              </span>
              <span className="font-mono2 font-bold text-[#1E1B18]">
                {dayName ? dayName(firstMove.day.label) : firstMove.day.label} at {fmtMin(firstMove.iv.startMin)}
              </span>
              <span className="text-[#5b4d41]">— {firstMove.iv.note}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 md:flex-col md:items-end">
          <button
            type="button"
            onClick={downloadIcs}
            className="inline-flex items-center gap-2 rounded-full bg-[#D96B43] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-[#c45a34]"
          >
            <CalendarPlus size={14} />
            Add to my calendar
          </button>
          {trip && days && (
            <SubscribeCalendar
              ics={ics}
              trip={trip}
              days={days}
              className="inline-flex items-center gap-2 rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-3.5 py-2 text-xs font-bold text-[#1E1B18] transition-colors hover:border-[#D96B43]"
            />
          )}

          {voiceAvailable && (
            <button
              type="button"
              onClick={listen}
              disabled={voiceState === "loading" || voiceState === "playing"}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#1E1B18] bg-[#FFF8EF] px-3.5 py-2 text-xs font-extrabold text-[#1E1B18] transition-colors hover:bg-[#1E1B18] hover:text-[#F5EFE6] disabled:opacity-50"
            >
              <Volume2 size={14} className="text-[#D96B43]" />
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
            className="inline-flex items-center gap-1.5 rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-3.5 py-2 text-xs font-bold text-[#5b4d41] transition-colors hover:border-[#1E1B18] hover:text-[#1E1B18]"
          >
            Full Printable Guide ({citations.length} studies)
            <ExternalLink size={12} />
          </Link>
        </div>
      </div>
    </section>
  );
}
