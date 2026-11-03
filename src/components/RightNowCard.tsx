"use client";

import { useEffect, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import type { TravelerNudge } from "@/domain/nudges";
import { CAT_ICON } from "@/components/DaySkyStrip";

export interface RightNowCardProps {
  step?: TravelerNudge | null;
  nowMin: number | null;
  isToday: boolean;
  selectedDayLabel: string;
  countdown: string | null;
  isDone?: boolean;
  isSkip?: boolean;
  onDone?: () => void;
  onSkip?: () => void;
  totalSteps?: number;
  completedCount?: number;
}

export function RightNowCard({
  step,
  isToday,
  selectedDayLabel,
  countdown,
  isDone,
  isSkip,
  onDone,
  onSkip,
  totalSteps = 0,
  completedCount = 0,
}: RightNowCardProps) {
  /* The hero slot hands off the moment a step is marked — `pickNextStep`
   * skips resolved ids — so the card would swap away before its done pulse
   * could be seen. Hold the finished step for the length of that one pulse
   * and show the confirmation instead. Under reduced motion there is no
   * pulse to watch, so the hold is skipped rather than shown as dead delay. */
  const [held, setHeld] = useState<TravelerNudge | null>(null);
  useEffect(() => {
    if (!held) return;
    const t = setTimeout(() => setHeld(null), 760);
    return () => clearTimeout(t);
  }, [held]);

  const motionAllowed = () =>
    typeof window === "undefined" ||
    !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const handleDone = () => {
    if (!held && step && motionAllowed()) setHeld(step);
    onDone?.();
  };

  if (!isToday) {
    return (
      <div className="right-now-card" role="region" aria-label={`Previewing ${selectedDayLabel}`}>
        <div className="right-now-head">
          <span className="right-now-badge">PLANNING AHEAD</span>
          <span className="right-now-time">{totalSteps} planned interventions</span>
        </div>
        <h4 className="right-now-title">Viewing {selectedDayLabel}</h4>
        <p className="right-now-desc">
          Review your scheduled light, sleep, and nutrition windows ahead of time.
        </p>
      </div>
    );
  }

  if (!step || (totalSteps > 0 && completedCount >= totalSteps)) {
    return (
      <div className="right-now-card" role="region" aria-label="Today's progress">
        <div className="right-now-head">
          <span className="right-now-badge">TODAY</span>
          <span className="right-now-time">{completedCount} of {totalSteps} done</span>
        </div>
        <h4 className="right-now-title">All steps complete for today</h4>
        <p className="right-now-desc">
          You have completed all scheduled interventions for today. Rest and protect your sleep window to help your body clock adapt.
        </p>
      </div>
    );
  }

  const shown = held ?? step;
  const shownDone = isDone || held !== null;
  const StepIcon = CAT_ICON[shown.category];
  const isActiveNow = !held && countdown === "now";

  return (
    <div
      className={`right-now-card${isActiveNow ? " active-window" : ""}`}
      role="region"
      aria-label={
        held
          ? "Just marked done"
          : isActiveNow
            ? "Active intervention right now"
            : "Next upcoming intervention"
      }
    >
      <div className="right-now-head">
        <span className={`right-now-badge${isActiveNow ? " active" : ""}`}>
          {isActiveNow && <span className="right-now-pulse" aria-hidden="true" />}
          {held
            ? "MARKED DONE"
            : isActiveNow
              ? "ACTIVE RIGHT NOW"
              : `NEXT UP · ${(countdown ?? "").toUpperCase()}`}
        </span>
        <span className="right-now-time">
          {fmtMin(shown.startMin)}–{fmtMin(shown.endMin)}
        </span>
      </div>

      <h4 className="right-now-title">
        <span className="tl-glyph" aria-hidden="true">
          <StepIcon size={16} strokeWidth={2.4} />
        </span>
        <span>{shown.title}</span>
      </h4>

      <p className="right-now-desc">{shown.actionSummary}</p>

      {(onDone || onSkip) && (
        <div className="right-now-actions">
          {onDone && (
            <button
              type="button"
              className={`p1 right-now-btn${shownDone ? " done just-done" : ""}`}
              onClick={held ? () => setHeld(null) : handleDone}
              aria-pressed={shownDone}
              aria-disabled={held ? true : undefined}
            >
              {shownDone ? "Marked done ✓" : "Done ✓"}
            </button>
          )}
          {onSkip && (
            <button
              type="button"
              className={`p2 right-now-btn${isSkip ? " skipped" : ""}`}
              onClick={held ? () => setHeld(null) : onSkip}
              aria-pressed={isSkip}
            >
              {isSkip ? "Noted ✓" : "Can't do this"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
