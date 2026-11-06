"use client";

import { useEffect, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import type { TravelerNudge } from "@/domain/nudges";
import { CAT_ICON } from "@/components/DaySkyStrip";
import { CUE_HOLD_MS } from "@/domain/motion-cues";

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
  /** Steps whose window closed without a mark — still open to a late tick. */
  missedCount?: number;
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
  missedCount = 0,
}: RightNowCardProps) {
  /* The hero slot hands off the moment a step is marked — `pickNextStep`
   * skips resolved ids — so the card would swap away before its done pulse
   * could be seen. Hold the finished step for the length of that one pulse
   * and show the confirmation instead. Under reduced motion there is no
   * pulse to watch, so the hold is skipped rather than shown as dead delay.
   * `CUE_HOLD_MS` is the same window the evaluator's verdict is held for. */
  const [held, setHeld] = useState<TravelerNudge | null>(null);
  useEffect(() => {
    if (!held) return;
    const t = setTimeout(() => setHeld(null), CUE_HOLD_MS);
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
          <span className="right-now-time">
            {totalSteps > 0 ? `${totalSteps} planned interventions` : "nothing planned yet"}
          </span>
        </div>
        <h4 className="right-now-title">Viewing {selectedDayLabel}</h4>
        <p className="right-now-desc">
          Review your scheduled light, sleep, and nutrition windows ahead of time.
        </p>
      </div>
    );
  }

  /* A day with nothing on it is not a finished day. Both used to land in the
   * "all complete" branch, so a day the plan never covered answered `0 of 0
   * done` — the interface inventing an achievement out of an empty list. The
   * trust rule runs the other way: nothing scheduled is reported as nothing
   * scheduled. */
  if (!step && totalSteps === 0) {
    return (
      <div className="right-now-card" role="region" aria-label="Nothing scheduled today">
        <div className="right-now-head">
          <span className="right-now-badge">TODAY</span>
          <span className="right-now-time">nothing scheduled</span>
        </div>
        <h4 className="right-now-title">No steps for this day</h4>
        <p className="right-now-desc">
          The plan has no light, sleep or nutrition windows here. A day with
          nothing scheduled is a rest day, not a missed one.
        </p>
      </div>
    );
  }

  /* `!step` is three different days, and one of them was being told it was
   * finished. All done is the only state that earns "complete"; a day whose
   * windows closed with steps still unmarked, and a day whose steps were
   * passed on, each get their own sentence and their own count. Nothing here
   * scolds — the missed rows are already listed in the feed below this card. */
  if (totalSteps > 0 && completedCount >= totalSteps) {
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

  if (!step) {
    const passed = Math.max(0, totalSteps - completedCount - missedCount);
    const missed = missedCount > 0;
    return (
      <div
        className="right-now-card"
        role="region"
        aria-label={missed ? "Every window has closed" : "Nothing left for today"}
      >
        <div className="right-now-head">
          <span className="right-now-badge">TODAY</span>
          <span className="right-now-time">
            {missed
              ? `${missedCount} missed of ${totalSteps}`
              : `${completedCount} of ${totalSteps} done`}
          </span>
        </div>
        <h4 className="right-now-title">
          {missed ? "Every window has closed" : "Nothing left for today"}
        </h4>
        <p className="right-now-desc">
          {missed
            ? `${missedCount} step${missedCount === 1 ? "" : "s"} went by unmarked${passed > 0 ? `, ${passed} passed on` : ""}. Nothing is lost — the plan builds from what you actually did, and tomorrow starts from there.`
            : `${passed === 1 ? "You passed on the window offered today" : `You passed on all ${passed} windows today`}. That is a logged choice, not a gap — tomorrow picks up from here.`}
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
