"use client";

// SolLuna — half sun, half moon.
//
// The mascot is a readout, not a decoration: the gap between the two halves
// is the gap between the body clock and the target, and the way the halves
// sit changes with the state. When a step is skipped the moon half droops,
// because that is what the model did — the projection slipped — and the
// repair is one tap away.
//
// The voice comes from the domain (`getMascotCopy`), not from this component:
// the rules about what the mascot may and may not say live with the rest of
// the model's rules, so they can be tested without rendering anything.

import { getMascotCopy, type MascotTone } from "@/domain/mascot";
import { sunSelfLidForDebt } from "@/domain/sun-self";

export type MascotState = "calm" | "syncing" | "drifting" | "droop" | "serious";

export interface SolLunaMascotProps {
  state: MascotState;
  tone: MascotTone;
  /** Hours the body clock is off the target. */
  misalignmentHours: number;
  /** Hours it would be off with no plan. */
  baselineMisalignmentHours: number;
  skippedToday?: boolean;
  isShiftPostNightWarning?: boolean;
  /** An explicit line, when the caller has something better to say than the
   *  state copy — the setup's answer-aware insight, for instance. */
  line?: string;
  size?: number;
}

/** How far the two halves drift apart, in degrees, per state. */
const SPLIT_BY_STATE: Record<MascotState, number> = {
  calm: 0,
  syncing: 12,
  drifting: 22,
  droop: 30,
  serious: 0,
};

export function SolLunaMascot({
  state,
  tone,
  misalignmentHours,
  baselineMisalignmentHours,
  skippedToday,
  isShiftPostNightWarning,
  line,
  size = 56,
}: SolLunaMascotProps) {
  const split = SPLIT_BY_STATE[state];
  const droop = state === "droop" ? 4 : 0;
  // One face family (round 24): the sun half speaks the sun-self's language —
  // the misalignment is debt, so the sun-side eye carries the same lid law
  // the traveller's own sun does, and three rays crown the sun half. The
  // moon half stays a moon: it is where the night should be.
  const lid = sunSelfLidForDebt(misalignmentHours * 60);
  const eyeRy = Math.max(0.4, 1.6 * (1 - lid));
  const eyeClosed = eyeRy < 0.62;
  const copy = line ?? getMascotCopy({
    tone,
    state,
    misalignmentHours,
    baselineMisalignmentHours,
    skippedToday,
    isShiftPostNightWarning,
  });

  return (
    <div className={`mascot${state === "serious" ? " mascot-serious" : ""}`}>
      {/* The picture is decorative: the words beside it are the message, and
          announcing both would read the same line twice. */}
      <svg
        className="mascot-art"
        width={size}
        height={size}
        viewBox="0 0 56 56"
        aria-hidden="true"
        focusable="false"
      >
        {/* the sun half */}
        <g transform={`rotate(${-split / 2} 28 28)`}>
          <path
            d="M28 6 A22 22 0 0 1 28 50 Z"
            fill="var(--dial-target)"
            opacity={state === "calm" ? 1 : 0.85}
          />
          {/* three rays crown the sun half — the family mark */}
          <g stroke="var(--dial-target)" strokeWidth="2" strokeLinecap="round" opacity="0.9">
            <line x1="51" y1="16" x2="54" y2="13" />
            <line x1="54" y1="28" x2="58" y2="28" />
            <line x1="51" y1="40" x2="54" y2="43" />
          </g>
        </g>
        {/* the moon half */}
        <g transform={`rotate(${split / 2} 28 28) translate(0 ${droop})`}>
          <path d="M28 6 A22 22 0 0 0 28 50 Z" fill="var(--dial-sleep)" />
        </g>
        {/* the rim, so the two halves read as one body */}
        <circle
          cx="28"
          cy="28"
          r="22"
          fill="none"
          stroke="var(--m-border)"
          strokeWidth="1.5"
        />
        {/* the eyes: the moon side keeps its dot; the sun side carries the
            lid — heavier the further the body is from the target */}
        <circle cx="21" cy="25" r="1.6" fill="var(--m-ink)" opacity={0.75} />
        {eyeClosed ? (
          <path
            d="M 32.6 31 Q 35 33.2 37.4 31"
            fill="none"
            stroke="var(--m-ink)"
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity={0.75}
          />
        ) : (
          <ellipse cx="35" cy="31" rx="1.6" ry={eyeRy.toFixed(2)} fill="var(--m-ink)" opacity={0.75} />
        )}
      </svg>
      <p className="mascot-say">{copy}</p>
    </div>
  );
}
