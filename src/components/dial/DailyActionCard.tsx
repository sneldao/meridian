"use client";

// The daily action card.
//
// One action. One time. One reason, in twenty words or fewer. Then Done and
// "Not tonight", and nothing else competing for the eye.
//
// Three things on it are load-bearing:
//
//   · the **channel** — does this move the clock, or does it only make the
//     traveller feel better? Caffeine and a run are not jet-lag treatment, and
//     the card says so instead of implying otherwise;
//   · the **provenance** — where the number under it came from (you told us,
//     measured, estimated, recommended, unknown);
//   · the **status** — a plan that has not been through the gate says
//     "proposed", a plan that failed says so, and neither is dressed up as
//     "checked".

import { useState } from "react";
import { getCitationsForKind, getEvidenceForKind, type EpistemicTag } from "@/domain/evidence";
import { CITATION_CATALOGUE } from "@/domain/citations";
import type { Citation, InterventionKind } from "@/domain/types";

export interface DailyAction {
  id: string;
  kind: InterventionKind | "hydration";
  title: string;
  timeWindow: string;
  startMin: number;
  endMin?: number;
  /** The reason, in twenty words or fewer. */
  shortReason: string;
  /** Where this claim comes from. */
  epistemicTag: EpistemicTag;
  /** The trade-off, when a commitment shapes the ask. */
  constraintNote?: string;
}

/**
 * `checked` — the plan went through the gate and passed.
 * `proposed` — nobody has scored it yet.
 * `failed` — the gate rejected it; the note says why.
 */
export type PlanStatus = "checked" | "proposed" | "failed";

export interface DailyActionCardProps {
  action: DailyAction;
  status: PlanStatus;
  /** Why the plan is in this state — a violation, for instance. */
  statusNote?: string;
  isDone: boolean;
  onMarkDone: () => void;
  isSkipped: boolean;
  onSkip: () => void;
  alcoholActive: boolean;
  onToggleAlcohol: () => void;
  /** The citations this run actually returned, if any. */
  citations?: Citation[];
}

export function DailyActionCard({
  action,
  status,
  statusNote,
  isDone,
  onMarkDone,
  isSkipped,
  onSkip,
  alcoholActive,
  onToggleAlcohol,
  citations,
}: DailyActionCardProps) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const evidence = getEvidenceForKind(action.kind);

  // The papers behind this nudge: the ones this run returned, when it
  // returned any. Only if it returned none do we fall back to the standing
  // reference set, and then we say so.
  const runCitations = citations?.length ? getCitationsForKind(action.kind, citations) : [];
  const standing = runCitations.length ? [] : getCitationsForKind(action.kind);
  const papers = runCitations.length ? runCitations : standing;

  const statusPill =
    status === "checked"
      ? { cls: "dac-pill-checked", label: "✓ Checked" }
      : status === "failed"
        ? { cls: "dac-pill-failed", label: "✕ Didn't pass" }
        : { cls: "dac-pill-proposed", label: "◌ Proposed" };

  return (
    <article className="dac">
      <div className="dac-top">
        <span
          className={`dac-pill ${evidence.channel === "moves_clock" ? "dac-pill-clock" : "dac-pill-comfort"}`}
        >
          {evidence.channelLabel}
        </span>
        <span className="dac-pill">{action.epistemicTag}</span>
        <span className={`dac-pill ${statusPill.cls}`}>{statusPill.label}</span>
        <span className="dac-time">{action.timeWindow}</span>
      </div>

      <h3 className="dac-action">{action.title}</h3>
      <p className="dac-reason">{action.shortReason}</p>

      {action.constraintNote && <p className="dac-note">{action.constraintNote}</p>}
      {statusNote && <p className="dac-note">{statusNote}</p>}
      {isSkipped && (
        <p className="dac-note">
          Skipped for today. The projection slips toward the no-plan baseline — no
          lecture, and one tap to undo.
        </p>
      )}
      {alcoholActive && (
        <p className="dac-note">
          Alcohol flagged. The model widens tonight&apos;s band rather than pretending
          the night went to plan.
        </p>
      )}

      <div className="dac-actions">
        <button
          type="button"
          className="dac-done pressable"
          aria-pressed={isDone}
          onClick={onMarkDone}
        >
          {isDone ? "✓ Done" : "Mark done"}
        </button>
        <button
          type="button"
          className="dac-done"
          aria-pressed={isSkipped}
          onClick={onSkip}
        >
          {isSkipped ? "Skipped — undo" : "Not tonight"}
        </button>
        <button
          type="button"
          className="dac-done"
          aria-pressed={alcoholActive}
          onClick={onToggleAlcohol}
        >
          {alcoholActive ? "🍷 Drinking — undo" : "🍷 I'm drinking"}
        </button>
        <button
          type="button"
          className="dac-done"
          aria-expanded={evidenceOpen}
          onClick={() => setEvidenceOpen((v) => !v)}
        >
          {evidenceOpen ? "Hide the evidence" : "Why this?"}
        </button>
      </div>

      {evidenceOpen && (
        <div className="dac-evidence">
          <p>
            <b>{evidence.howItWorks}</b>
          </p>
          <p>{evidence.inRealTrips}</p>
          {/* Two chips rather than a run-on line: the grade and the field
              evidence are two different questions, and a traveller should be
              able to take one in without reading the other. */}
          <div className="dac-grades">
            <span className="dac-grade">Mechanism: {evidence.mechanismGrade}</span>
            <span className="dac-grade">Field evidence: {evidence.fieldGrade}</span>
          </div>
          {papers.length ? (
            <>
              <p>
                {runCitations.length
                  ? "Cited by the crew for this run:"
                  : "Standing references (the crew has not cited this one yet):"}
              </p>
              <ul>
                {papers.map((c) => (
                  <li key={c.id}>
                    <a href={c.url} target="_blank" rel="noreferrer">
                      {c.title}
                    </a>
                    {c.year ? ` (${c.year})` : ""}
                    {c.doi ? ` — doi:${c.doi}` : ""}
                    {c.source === "verified-fallback" ? " · standing reference" : ""}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              No paper in the set backs this one. The grade above is all there is,
              and the card says so.
            </p>
          )}
          <p>
            These papers support the mechanism. They do not validate Meridian&apos;s
            own arithmetic.
          </p>
        </div>
      )}
    </article>
  );
}

/** The catalogue, for a caller that needs the standing set directly. */
export const STANDING_CITATIONS = CITATION_CATALOGUE;
