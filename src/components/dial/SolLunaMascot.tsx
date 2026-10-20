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
  size = 56,
}: SolLunaMascotProps) {
  const split = SPLIT_BY_STATE[state];
  const droop = state === "droop" ? 4 : 0;
  const copy = getMascotCopy({
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
        {/* the eyes: a little less awake when the body is */}
        <circle cx="21" cy="25" r="1.6" fill="var(--m-ink)" opacity={0.75} />
        <circle cx="35" cy="31" r="1.6" fill="var(--m-ink)" opacity={0.75} />
      </svg>
      <p className="mascot-say">{copy}</p>
    </div>
  );
}
