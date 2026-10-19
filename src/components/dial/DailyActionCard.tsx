"use client";

import React, { useState } from "react";
import {
  getCitationsForKind,
  getEvidenceForKind,
  type EpistemicTag,
} from "@/domain/evidence";
import type { DirectionStrategyExplanation } from "@/domain/misalignment";
import type { Citation, InterventionKind } from "@/domain/types";

export interface PrimaryActionItem {
  id: string;
  kind: InterventionKind | "hydration";
  title: string;
  timeWindow: string;
  /** Strictly concise (~15-20 words max) body copy on the primary screen. */
  shortReason: string;
  epistemicTag: EpistemicTag;
  constraintTradeOff?: string;
}

export interface DailyActionCardProps {
  dayLabel: string;
  mode: "TRIP" | "SHIFT";
  planStatus: "CHECKED" | "PROPOSED";
  planStatusDetail: string;
  onTogglePlanStatus?: () => void;
  action: PrimaryActionItem;
  isDone: boolean;
  isSkipped: boolean;
  alcoholActive: boolean;
  onMarkDone: () => void;
  onSkipTonight: () => void;
  onRepairSkip: () => void;
  onToggleAlcohol: () => void;
  directionStrategy?: DirectionStrategyExplanation;
  extraCitations?: Citation[];
  postShiftSafetyWarning?: string;
}

/**
 * Section 3 & 4 — The Daily Action Card.
 * Answers four things within seconds: what matters now, what to do, when, and why.
 * - One primary action in large type, a time, and one short reason (~20 words max).
 * - Buttons: Done, Not tonight. Skipping replans quietly; no lecture.
 * - Distinct channel badge: "Moves your clock" vs "Helps you feel better".
 * - PROPOSED vs CHECKED state distinguishable at a glance.
 * - Optional 1-tap "I'm drinking" alcohol modifier.
 * - Anything longer (two-part seed evidence, citations, direction strategy) is one tap away.
 */
export function DailyActionCard({
  dayLabel,
  mode,
  planStatus,
  planStatusDetail,
  onTogglePlanStatus,
  action,
  isDone,
  isSkipped,
  alcoholActive,
  onMarkDone,
  onSkipTonight,
  onRepairSkip,
  onToggleAlcohol,
  directionStrategy,
  postShiftSafetyWarning,
}: DailyActionCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const evidence = getEvidenceForKind(action.kind);
  const seedCitations = getCitationsForKind(action.kind);
  const isClockMover = evidence.channel === "moves_clock";

  return (
    <article
      aria-label={`Primary daily action for ${dayLabel}`}
      className="rounded-[28px] border border-[#e3d5c3] bg-[#FFF8EF] p-5 shadow-[0_20px_44px_-22px_rgba(30,27,24,0.22)] sm:p-6"
    >
      {/* Top Row: Channel Pill + Epistemic Tag + PROPOSED vs CHECKED State */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold tracking-wide ${
              isClockMover
                ? "bg-[#D96B43] text-white"
                : "bg-[#2A6F4E] text-white"
            }`}
          >
            <span>{isClockMover ? "⏱ Moves your clock" : "🌿 Helps you feel better"}</span>
          </span>

          <span className="inline-flex items-center rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-2.5 py-0.5 text-[11px] font-bold text-[#5b4d41]">
            {action.epistemicTag}
          </span>
        </div>

        {/* PROPOSED vs CHECKED Pill (Section 6 & 11.3) */}
        <button
          type="button"
          onClick={onTogglePlanStatus}
          title={planStatusDetail}
          data-testid="plan-status-badge"
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-extrabold tracking-wider transition ${
            planStatus === "CHECKED"
              ? "border-[#2A6F4E] bg-[#E8F5EE] text-[#1B4D35]"
              : "border-[#D96B43] border-dashed bg-[#FFF3E2] text-[#A8431E]"
          }`}
        >
          <span>{planStatus === "CHECKED" ? "✓ CHECKED" : "◌ PROPOSED"}</span>
          <span className="text-[10px] font-semibold opacity-80">
            {planStatus === "CHECKED" ? "(Verified limits)" : "(Draft / unverified)"}
          </span>
        </button>
      </div>

      {/* Serious Post-Shift Driving Safety Banner in SHIFT Mode (Section 7 — No Humour) */}
      {mode === "SHIFT" && postShiftSafetyWarning && (
        <div
          role="alert"
          className="mt-3 rounded-2xl border-2 border-[#B91C1C] bg-[#FEF2F2] p-3.5 text-xs leading-relaxed text-[#7F1D1D]"
        >
          <strong className="block font-extrabold uppercase tracking-wider">
            Post-Night-Shift Drowsiness &amp; Driving Warning
          </strong>
          <p className="mt-1">{postShiftSafetyWarning}</p>
        </div>
      )}

      {/* Time Window + Large Primary Action Headline + Short Reason (<20 words) */}
      <div className="mt-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-[#f6dccb] px-3.5 py-1 text-xs font-extrabold tracking-wider text-[#a8431e]">
          <span>{dayLabel}</span>
          <span>·</span>
          <span>{action.timeWindow}</span>
        </div>

        <h2 className="mt-2.5 text-2xl font-extrabold leading-tight tracking-tight text-[#1E1B18] sm:text-[26px]">
          {action.title}
        </h2>

        {/* Strictly concise <20-word reason on primary screen */}
        <p
          className="mt-2 text-sm font-medium leading-snug text-[#5b4d41]"
          data-testid="primary-action-reason"
        >
          {action.shortReason}
        </p>

        {action.constraintTradeOff && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-[#f1e6d6] px-3 py-1.5 text-xs font-semibold text-[#5b4d41]">
            <span>⚖️</span>
            <span>{action.constraintTradeOff}</span>
          </div>
        )}
      </div>

      {/* Quiet Replan Feedback when "Not tonight" is active */}
      {isSkipped && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#d8c6ae] bg-[#f5efe6] px-3.5 py-2.5 text-xs text-[#1E1B18]">
          <span>
            <strong>Replanned quietly:</strong> Tonight&apos;s window skipped without penalty.{" "}
            {isClockMover
              ? "Projected phase shift moved toward the no-adjustment baseline."
              : "Comfort nudge skipped; your body-clock phase estimate is unchanged."}
          </span>
          <button
            type="button"
            onClick={onRepairSkip}
            className="rounded-full bg-[#1E1B18] px-3 py-1 font-bold text-[#F5EFE6] transition hover:bg-[#D96B43]"
          >
            ↻ 1-Tap Repair
          </button>
        </div>
      )}

      {/* Alcohol Modifier Tip when active */}
      {alcoholActive && (
        <div className="mt-3 rounded-2xl border border-[#e3d5c3] bg-[#f5efe6] px-3.5 py-2.5 text-xs text-[#5b4d41]">
          <strong className="text-[#1E1B18]">🍷 &ldquo;I&apos;m drinking&rdquo; modifier active (Simulated):</strong>{" "}
          Sleep-stage continuity is less predictable tonight (uncertainty band widened by ±20m). Tip: pair with water and keep tomorrow&apos;s wake &amp; morning light anchor steady.
        </div>
      )}

      {/* Primary Action Controls: Circular Done + Not tonight + 1-Tap Alcohol + Evidence Drawer Toggle */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#efe2d0] pt-4">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Circular completion button */}
          <button
            type="button"
            onClick={onMarkDone}
            aria-pressed={isDone}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-extrabold transition ${
              isDone
                ? "bg-[#2A6F4E] text-white shadow-sm"
                : "bg-[#1E1B18] text-[#F5EFE6] hover:bg-[#D96B43]"
            }`}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">
              {isDone ? "✓" : ""}
            </span>
            <span>{isDone ? "Done" : "Mark Done"}</span>
          </button>

          {/* Not tonight button (quiet replan) */}
          <button
            type="button"
            onClick={onSkipTonight}
            aria-pressed={isSkipped}
            className={`rounded-full border px-4 py-2.5 text-xs font-extrabold transition ${
              isSkipped
                ? "border-[#D96B43] bg-[#f6dccb] text-[#a8431e]"
                : "border-[#1E1B18] bg-transparent text-[#1E1B18] hover:bg-[#1E1B18] hover:text-[#F5EFE6]"
            }`}
          >
            {isSkipped ? "Skipped (Tap to undo)" : "Not tonight"}
          </button>

          {/* Optional one-tap "I'm drinking" modifier */}
          <button
            type="button"
            onClick={onToggleAlcohol}
            aria-pressed={alcoholActive}
            className={`rounded-full border px-3.5 py-2 text-xs font-bold transition ${
              alcoholActive
                ? "border-[#a8431e] bg-[#a8431e] text-white"
                : "border-[#d8c6ae] bg-[#f5efe6] text-[#5b4d41] hover:border-[#1E1B18] hover:text-[#1E1B18]"
            }`}
          >
            🍷 I&apos;m drinking
          </button>
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          className="rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-3.5 py-2 text-xs font-extrabold text-[#1E1B18] transition hover:border-[#D96B43]"
        >
          {detailsOpen ? "Hide evidence & why ↑" : "Why & evidence (1 tap) ↓"}
        </button>
      </div>

      {/* One-Tap Drawer: Two-Part Seed Evidence + Verified Citations + Epistemic Provenance */}
      {detailsOpen && (
        <div
          className="mt-4 space-y-3 rounded-2xl border border-[#e3d5c3] bg-[#f5efe6] p-4 text-xs text-[#1E1B18]"
          data-testid="evidence-drawer"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-extrabold uppercase tracking-wider text-[#D96B43]">
              Two-Part Evidence Rubric (Seed Table)
            </span>
            <span className="rounded-full bg-[#fff8ef] px-2.5 py-0.5 text-[11px] font-bold text-[#5b4d41]">
              Channel: {evidence.channelLabel}
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl bg-[#FFF8EF] p-3 border border-[#e3d5c3]">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#2A6F4E]">
                1. How it works ({evidence.mechanismGrade})
              </div>
              <p className="mt-1 leading-relaxed text-[#5b4d41]">
                {evidence.howItWorks}
              </p>
            </div>

            <div className="rounded-xl bg-[#FFF8EF] p-3 border border-[#e3d5c3]">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#a8431e]">
                2. In real trips ({evidence.fieldGrade})
              </div>
              <p className="mt-1 leading-relaxed text-[#5b4d41]">
                {evidence.inRealTrips}
              </p>
            </div>
          </div>

          {/*PROPOSED vs CHECKED definition*/}
          <div className="rounded-xl bg-[#FFF8EF] p-3 border border-[#e3d5c3]">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#1E1B18]">
              Plan Verification Status: {planStatus}
            </div>
            <p className="mt-1 text-[#5b4d41]">
              {planStatusDetail}{" "}
              <strong>
                CHECKED verifies schedule feasibility (flight times, commitments, ≤90m/day shift rate, ≥6h sleep opportunity) — it is not a guarantee of a physiological outcome.
              </strong>
            </p>
          </div>

          {/* Direction Strategy for >=8h Eastward Trips */}
          {directionStrategy && (
            <div className="rounded-xl bg-[#FFF8EF] p-3 border border-[#e3d5c3]">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#1E1B18]">
                Why {directionStrategy.recommendedDirection.toUpperCase()} ({directionStrategy.timeZoneDiffHours}h shift)?
              </div>
              <p className="mt-1 text-[#5b4d41]">{directionStrategy.whyThisDirection}</p>
              <p className="mt-1 text-[#7a6a5c]">{directionStrategy.alternativeTradeOff}</p>
            </div>
          )}

          {/* Verified Citations */}
          <div className="rounded-xl bg-[#FFF8EF] p-3 border border-[#e3d5c3]">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#1E1B18]">
              Verified Sources (Supports mechanism; does not validate Meridian&apos;s model)
            </div>
            <ul className="mt-1.5 space-y-1 text-[#5b4d41]">
              {seedCitations.map((c) => (
                <li key={c.id}>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[#1E1B18] underline decoration-[#D96B43] hover:text-[#D96B43]"
                  >
                    {c.title}
                  </a>{" "}
                  {c.venue ? `— ${c.venue}` : ""}{" "}
                  {c.doi ? `(DOI: ${c.doi})` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-[#7a6a5c]">
              Medical disclaimer: Meridian is not a medical device and does not diagnose, treat, or recommend supplements or medications (including melatonin—ask a clinician). &ldquo;Light&rdquo; refers strictly to bright visible light for circadian timing, never UV or vitamin D exposure.
            </p>
          </div>
        </div>
      )}
    </article>
  );
}
