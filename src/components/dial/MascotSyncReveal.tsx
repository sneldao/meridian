"use client";

// The baseline-to-plan reveal.
//
// The first time a traveller sees their own body clock next to the night
// they are being asked to sleep, the two numbers are all the explanation
// that is needed: where you are, where you are going, and the distance
// between them. The mascot sits in the middle, because the distance is
// exactly what it is reacting to.
//
// The reveal is honest about which number is which. The baseline is what the
// traveller told us (or what a wearable measured); the target is the
// destination's night; the distance between them is the model's estimate, and
// it arrives with a band.

import { fmtMin } from "@/domain/circadian";
import { type MascotTone } from "@/domain/mascot";
import { SolLunaMascot } from "./SolLunaMascot";

export interface MascotSyncRevealProps {
  /** The wearer's baseline — where the body clock is now. */
  baseline: { bedtimeMin: number; wakeMin: number; source: "self-reported" | "measured" };
  /** Where the plan is aiming. */
  target: { bedtimeMin: number; wakeMin: number; label: string };
  /** The model's estimate of the distance between them, in hours. */
  misalignmentHours: number;
  baselineMisalignmentHours: number;
  tone: MascotTone;
}

export function MascotSyncReveal({
  baseline,
  target,
  misalignmentHours,
  baselineMisalignmentHours,
  tone,
}: MascotSyncRevealProps) {
  return (
    <section className="dial" aria-label="Where you are, and where you are going">
      <h3 className="dial-title">Your clock, and the night you are aiming at</h3>
      <ul className="dial-list">
        <li className="dial-list-row">
          <span>
            Your usual sleep{" "}
            <span className="dial-sub">
              ({baseline.source === "measured" ? "Measured" : "You told us"}) · your
              clock at home
            </span>
          </span>
          <span>
            {fmtMin(baseline.bedtimeMin)}–{fmtMin(baseline.wakeMin)}
          </span>
        </li>
        <li className="dial-list-row">
          <span>{target.label}</span>
          <span>
            {fmtMin(target.bedtimeMin)}–{fmtMin(target.wakeMin)}
          </span>
        </li>
        <li className="dial-list-row">
          <span>The distance between them</span>
          <span>{misalignmentHours.toFixed(1)}h</span>
        </li>
        <li className="dial-list-row">
          <span className="dial-sub">
            How far your body clock will read from that night when you land.
          </span>
          <span />
        </li>
        <li className="dial-list-row">
          <span>Without a plan it would be</span>
          <span>{baselineMisalignmentHours.toFixed(1)}h</span>
        </li>
      </ul>
      <SolLunaMascot
        state={misalignmentHours <= 1 ? "calm" : "syncing"}
        tone={tone}
        misalignmentHours={misalignmentHours}
        baselineMisalignmentHours={baselineMisalignmentHours}
      />
    </section>
  );
}
