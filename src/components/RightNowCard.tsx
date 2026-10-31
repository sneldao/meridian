"use client";

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

  const StepIcon = CAT_ICON[step.category];
  const isActiveNow = countdown === "now";

  return (
    <div
      className={`right-now-card${isActiveNow ? " active-window" : ""}`}
      role="region"
      aria-label={isActiveNow ? "Active intervention right now" : "Next upcoming intervention"}
    >
      <div className="right-now-head">
        <span className={`right-now-badge${isActiveNow ? " active" : ""}`}>
          {isActiveNow && <span className="right-now-pulse" aria-hidden="true" />}
          {isActiveNow ? "ACTIVE RIGHT NOW" : `NEXT UP · ${(countdown ?? "").toUpperCase()}`}
        </span>
        <span className="right-now-time">
          {fmtMin(step.startMin)}–{fmtMin(step.endMin)}
        </span>
      </div>

      <h4 className="right-now-title">
        <span className="tl-glyph" aria-hidden="true">
          <StepIcon size={16} strokeWidth={2.4} />
        </span>
        <span>{step.title}</span>
      </h4>

      <p className="right-now-desc">{step.actionSummary}</p>

      {(onDone || onSkip) && (
        <div className="right-now-actions">
          {onDone && (
            <button
              type="button"
              className={`p1 right-now-btn${isDone ? " done" : ""}`}
              onClick={onDone}
              aria-pressed={isDone}
            >
              {isDone ? "Marked done ✓" : "Done ✓"}
            </button>
          )}
          {onSkip && (
            <button
              type="button"
              className={`p2 right-now-btn${isSkip ? " skipped" : ""}`}
              onClick={onSkip}
              aria-pressed={isSkip}
            >
              {isSkip ? "Skipped ✓" : "Skip"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
