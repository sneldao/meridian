"use client";

// The five-step setup for the clock.
//
// The answers are the traveller's, so they are tagged as theirs: "you told
// us". The answers change the model *as they are given* — the dial behind
// this sheet moves while you answer, because a setup flow that only applies
// at the end is a form, and a form is where people stop reading.
//
// Five steps, each with one question:
//   1. which clock — travelling, or shift work
//   2. your usual sleep — the baseline every number is built on
//   3. the commitments to protect — the real ones from the calendar
//   4. where the numbers come from — self-report, or a wearable's measure
//   5. the mascot's voice, and what Meridian is and is not
//
// The last step opens the disclosure. It is not a footnote: the crew advises
// on timing, never on medication, and a traveller is owed that in plain words
// before the first plan, not in a link after it.

import { useEffect, useRef, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import { type MascotTone } from "@/domain/mascot";
import { useFocusTrap } from "@/lib/a11y";
import { MascotSyncReveal } from "./MascotSyncReveal";
import type { MeridianMode } from "./MeridianDailyScreen";

export interface OnboardingState {
  mode: MeridianMode;
  bedtimeMin: number;
  wakeMin: number;
  chronotype: "early" | "neutral" | "late";
  wearableOptedIn: boolean;
  tone: MascotTone;
  /** The ids of the commitments the traveller wants protected. */
  protect: string[];
}

export interface OnboardingCommitment {
  id: string;
  title: string;
  startMin: number;
  endMin: number;
  movable: boolean;
}

export interface MeridianOnboardingProps {
  open: boolean;
  state: OnboardingState;
  /** Live: every change lands on the model immediately. */
  onChange: (next: OnboardingState) => void;
  onClose: () => void;
  onComplete: () => void;
  commitments: OnboardingCommitment[];
  /** The reveal, when there is a plan to reveal against. */
  reveal?: {
    baseline: {
      bedtimeMin: number;
      wakeMin: number;
      source: "self-reported" | "measured";
    };
    target: { bedtimeMin: number; wakeMin: number; label: string };
    misalignmentHours: number;
    baselineMisalignmentHours: number;
  };
}

const TOTAL_STEPS = 5;

export function MeridianOnboarding({
  open,
  state,
  onChange,
  onClose,
  onComplete,
  commitments,
  reveal,
}: MeridianOnboardingProps) {
  const [step, setStep] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open && !sheetOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (sheetOpen) setSheetOpen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, sheetOpen, onClose]);

  if (!open) return null;

  const set = (patch: Partial<OnboardingState>) => onChange({ ...state, ...patch });
  const stepTitles = [
    "Which clock?",
    "Your usual sleep",
    "What should Meridian protect?",
    "Where your numbers come from",
    "The mascot's voice, and the small print",
  ];

  return (
    <div
      className="sheet-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(12, 10, 8, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 60,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Set up your clock"
        className="dial"
        style={{ maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}
      >
        <div className="dial-head">
          <h3 className="dial-title">{stepTitles[step - 1]}</h3>
          <span className="dial-sub">
            Step {step} of {TOTAL_STEPS}
          </span>
        </div>

        {step === 1 && (
          <div className="dial-actions">
            <button
              type="button"
              className="dial-btn"
              aria-pressed={state.mode === "TRIP"}
              onClick={() => set({ mode: "TRIP" })}
            >
              I&apos;m travelling
            </button>
            <button
              type="button"
              className="dial-btn"
              aria-pressed={state.mode === "SHIFT"}
              onClick={() => set({ mode: "SHIFT" })}
            >
              I work rotating shifts
            </button>
            <span className="dial-sub">You told us</span>
          </div>
        )}

        {step === 2 && (
          <div className="dial-center">
            <label className="dac-reason">
              Usual bedtime (you told us) — {fmtMin(state.bedtimeMin)}
              <input
                type="range"
                min={18 * 60}
                max={26 * 60}
                step={15}
                value={state.bedtimeMin}
                onChange={(e) => set({ bedtimeMin: Number(e.target.value) })}
                style={{ width: "100%" }}
              />
            </label>
            <label className="dac-reason">
              Usual wake time (you told us) — {fmtMin(state.wakeMin)}
              <input
                type="range"
                min={3 * 60}
                max={12 * 60}
                step={15}
                value={state.wakeMin}
                onChange={(e) => set({ wakeMin: Number(e.target.value) })}
                style={{ width: "100%" }}
              />
            </label>
            <div className="dial-actions">
              {(["early", "neutral", "late"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="dial-btn"
                  aria-pressed={state.chronotype === c}
                  onClick={() => set({ chronotype: c })}
                >
                  {c}
                </button>
              ))}
              <span className="dial-sub">You told us</span>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="dial-center">
            {commitments.length ? (
              <ul className="dial-list">
                {commitments.map((c) => (
                  <li className="dial-list-row" key={c.id}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={state.protect.includes(c.id)}
                        onChange={(e) =>
                          set({
                            protect: e.target.checked
                              ? [...state.protect, c.id]
                              : state.protect.filter((id) => id !== c.id),
                          })
                        }
                      />
                      <span>
                        {c.title}{" "}
                        <span className="dial-sub">
                          {fmtMin(c.startMin)}–{fmtMin(c.endMin)} ·{" "}
                          {c.movable ? "movable" : "fixed"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dial-sub">
                No commitments on the calendar yet. Meridian will plan around what
                is there and nothing else.
              </p>
            )}
            <span className="dial-sub">You told us</span>
          </div>
        )}

        {step === 4 && (
          <div className="dial-center">
            <p className="dac-reason">
              Every number Meridian shows carries a tag:{" "}
              <b>You told us</b>, <b>Measured</b>, <b>Estimated</b>,{" "}
              <b>Recommended</b> or <b>Unknown</b>. A wearable knows your phase
              better than self-report does, so it narrows the uncertainty band
              around the estimate.
            </p>
            <div className="dial-actions">
              <button
                type="button"
                className="dial-btn"
                aria-pressed={!state.wearableOptedIn}
                onClick={() => set({ wearableOptedIn: false })}
              >
                From what I tell you
              </button>
              <button
                type="button"
                className="dial-btn"
                aria-pressed={state.wearableOptedIn}
                onClick={() => set({ wearableOptedIn: true })}
              >
                From a wearable (simulated here)
              </button>
            </div>
            <p className="dial-sub">
              Simulated in this build — no Apple Health or Garmin connection is
              live, and the label says so wherever the number appears.
            </p>
          </div>
        )}

        {step === 5 && (
          <div className="dial-center">
            <div className="dial-actions">
              {(["gentle", "cheeky", "direct"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="dial-btn"
                  aria-pressed={state.tone === t}
                  onClick={() => set({ tone: t })}
                >
                  {t}
                </button>
              ))}
            </div>
            {reveal && (
              <MascotSyncReveal
                baseline={reveal.baseline}
                target={reveal.target}
                misalignmentHours={reveal.misalignmentHours}
                baselineMisalignmentHours={reveal.baselineMisalignmentHours}
                tone={state.tone}
              />
            )}
            <button
              type="button"
              className="dial-btn"
              onClick={() => setSheetOpen(true)}
            >
              What Meridian is, and is not
            </button>
          </div>
        )}

        <div className="dial-actions" style={{ justifyContent: "space-between" }}>
          <button
            type="button"
            className="dial-btn"
            onClick={() => (step === 1 ? onClose() : setStep(step - 1))}
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          <button
            type="button"
            className="dial-btn"
            onClick={() => {
              if (step === TOTAL_STEPS) onComplete();
              else setStep(step + 1);
            }}
          >
            {step === TOTAL_STEPS ? "Done" : "Next"}
          </button>
        </div>
      </div>

      {sheetOpen && (
        <div
          className="sheet-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(12, 10, 8, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 61,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="What Meridian is, and is not"
            className="dial"
            style={{ maxWidth: 520, width: "100%", maxHeight: "85vh", overflow: "auto" }}
          >
            <h3 className="dial-title">What Meridian is, and is not</h3>
            <div className="dac-evidence">
              <p>
                <b>What it is.</b> A deterministic circadian timing planner. It
                reads your sleep baseline, your calendar and the literature, and
                places the light and the dark so your body clock has somewhere to
                go. Every number it shows is computed by a model, and the model
                is the same one the crew&apos;s plans are judged against.
              </p>
              <p>
                <b>What it is not.</b> Not a medical device. It does not diagnose
                anything, it does not measure your melatonin phase directly, and
                it never recommends a supplement, a medicine or a dose — the crew
                advises on <i>when</i>, never on <i>how much</i>. It cannot tell
                you whether you are fit to drive.
              </p>
              <p>
                <b>What the papers mean.</b> The studies behind each step support
                the mechanism. They do not validate Meridian&apos;s own
                arithmetic, and the number on the dial is an estimate with an
                uncertainty band, not a measurement.
              </p>
              <p>
                <b>What happens to your data.</b> Your trip, calendar and answers
                are kept in this browser so your plan is there when you come
                back. If the deployment has persistence configured, the plan and
                your check-ins are also stored in the project&apos;s database. The
                wearable import is simulated in this build — nothing is read
                from a wearable.
              </p>
            </div>
            <div className="dial-actions">
              <button type="button" className="dial-btn" onClick={() => setSheetOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
