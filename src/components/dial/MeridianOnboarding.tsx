"use client";

// The setup — a sequence of scenes, not a form.
//
// The shape came from a reference: one question per screen, a progress arc, a
// back button, and the dial itself as the answer to the first question. It is
// not a form with a scroll; it is five scenes, and the traveller can always
// see how far in they are and step back.
//
// The order is the product's argument:
//   1. your night (answered on the dial — the same picture the rest of the
//      app uses, so it is learned once)
//   2. what Meridian must protect (their real calendar, not a form field)
//   3. where the numbers come from (self-report or a wearable — and the
//      difference is honest about what it costs)
//   4. the mascot's voice and the small print
//   5. the handoff: the first thing to do, and a way in
//
// Everything the traveller answers is tagged as theirs, and the mascot reacts
// to the answer rather than to a generic state — a lark and a night owl get
// different sentences, because the sentence is about them.

import { useEffect, useRef, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import { bandForWakeTime, getSleepInsight, type SleepBand } from "@/domain/mascot";
import { useFocusTrap } from "@/lib/a11y";
import { DisclosureSheet } from "./DisclosureSheet";
import { MascotSyncReveal } from "./MascotSyncReveal";
import { SleepDial } from "./SleepDial";
import { SolLunaMascot } from "./SolLunaMascot";

/** Which clock the setup is for. SHIFT is its own door (see /shift), so the
 *  setup no longer asks: the surface you are on already knows. */
export type MeridianMode = "TRIP" | "SHIFT";

export interface OnboardingState {
  bedtimeMin: number;
  wakeMin: number;
  chronotype: "early" | "neutral" | "late";
  wearableOptedIn: boolean;
  tone: "gentle" | "cheeky" | "direct";
  /** The ids of the commitments the traveller wants protected. */
  protect: string[];
}

export interface OnboardingCommitment {
  id: string;
  title: string;
  /** The trip day it falls on, so two "Team standup"s are told apart. */
  dayLabel?: string;
  startMin: number;
  endMin: number;
  movable: boolean;
}

export interface MeridianOnboardingProps {
  open: boolean;
  /** Which clock this setup is for. */
  mode: MeridianMode;
  state: OnboardingState;
  /** Live: every change lands on the model immediately. */
  onChange: (next: OnboardingState) => void;
  onClose: () => void;
  onComplete: () => void;
  commitments: OnboardingCommitment[];
  /** The travel direction, so the mascot can say whether the answer helps. */
  direction?: "east" | "west" | null;
  /** The wake band the traveller's answer implies. */
  band?: SleepBand | null;
  /** The first thing to do, named in the handoff. */
  firstAction?: { title: string; timeWindow: string } | null;
  /** Where you are and where you are going, for the handoff scene. */
  reveal?: {
    baseline: { bedtimeMin: number; wakeMin: number; source: "self-reported" | "measured" };
    target: { bedtimeMin: number; wakeMin: number; label: string };
    misalignmentHours: number;
    baselineMisalignmentHours: number;
  };
}

const SCENES = ["sleep", "commitments", "provenance", "voice", "handoff"] as const;
type SceneId = (typeof SCENES)[number];

const SCENE_TITLES: Record<SceneId, string> = {
  sleep: "When does your body expect to sleep?",
  commitments: "What should Meridian protect?",
  provenance: "Where should your numbers come from?",
  voice: "How should I talk to you?",
  handoff: "You're set",
};

export function MeridianOnboarding({
  open,
  mode,
  state,
  onChange,
  onClose,
  onComplete,
  commitments,
  direction,
  band,
  firstAction,
  reveal,
}: MeridianOnboardingProps) {
  const [sceneIdx, setSceneIdx] = useState(0);
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
  const scene = SCENES[sceneIdx];
  const isLast = sceneIdx === SCENES.length - 1;
  const progress = (sceneIdx + 1) / SCENES.length;
  const sleepMin = ((state.wakeMin - state.bedtimeMin) + 1440) % 1440;

  // The dial's own answer is the answer: the wake time says which band the
  // traveller is in, so the mascot can say something about *them*.
  const answerBand = bandForWakeTime(state.wakeMin) ?? band;
  const insight = getSleepInsight({
    band: answerBand,
    direction,
    sleepHours: sleepMin / 60,
  });

  return (
    <div className="setup" role="dialog" aria-modal="true" aria-label="Set up your clock">
      <div className="setup-inner" ref={panelRef}>
        {/* The bar: back, progress, and how far in we are. */}
        <div className="setup-bar">
          <button
            type="button"
            className="setup-back"
            aria-label="Back"
            disabled={sceneIdx === 0}
            onClick={() => setSceneIdx((i) => Math.max(0, i - 1))}
          >
            ←
          </button>
          <div className="setup-progress" role="presentation">
            <div className="setup-progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="setup-count">
            {sceneIdx + 1}/{SCENES.length}
          </span>
        </div>

        {/* Moving to the next scene changes the whole question, so it is
            announced rather than left to be discovered. */}
        <p className="sr-only" aria-live="polite">
          Step {sceneIdx + 1} of {SCENES.length}: {SCENE_TITLES[scene]}
        </p>

        <div className="setup-scene" key={scene}>
          <h2 className="setup-title">{SCENE_TITLES[scene]}</h2>

          {scene === "sleep" && (
            <>
              <p className="setup-lede">
                Move the arc to your night. This is the number every other step is
                measured against.
              </p>
              <SleepDial
                bedtimeMin={state.bedtimeMin}
                wakeMin={state.wakeMin}
                direction={direction}
                band={answerBand}
                onChange={(next) => set(next)}
              />
              {insight && (
                <div className="setup-mascot">
                  <SolLunaMascot
                    state="calm"
                    tone={state.tone}
                    misalignmentHours={0}
                    baselineMisalignmentHours={0}
                    line={insight}
                  />
                </div>
              )}
            </>
          )}

          {scene === "commitments" && (
            <>
              <p className="setup-lede">
                The fixed things in your calendar. Meridian plans around them
                rather than through them.
              </p>
              {commitments.length ? (
                <ul className="setup-list">
                  {commitments.map((c) => (
                    <li key={c.id}>
                      <label>
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
                          {c.dayLabel ? `${c.dayLabel} · ` : ""}
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
                <p className="setup-lede">
                  Nothing on the calendar yet. Meridian will plan around what is
                  there, and nothing else.
                </p>
              )}
            </>
          )}

          {scene === "provenance" && (
            <>
              <p className="setup-lede">
                Every number Meridian shows carries a tag:{" "}
                <b>You told us</b>, <b>Measured</b>, <b>Estimated</b>,{" "}
                <b>Recommended</b> or <b>Unknown</b>. A wearable knows your phase
                better than a self-report does, so it narrows the band around
                the estimate.
              </p>
              <div className="setup-choices">
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
            </>
          )}

          {scene === "voice" && (
            <>
              <div className="setup-choices">
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
              <button
                type="button"
                className="dial-btn"
                onClick={() => setSheetOpen(true)}
              >
                What Meridian is, and is not
              </button>
            </>
          )}

          {scene === "handoff" && (
            <div className="setup-handoff">
              <div className="setup-handoff-arc" aria-hidden="true">
                <svg viewBox="0 0 120 120" width="120" height="120">
                  <circle cx="60" cy="60" r="52" className="dial-ring" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    className="dial-body-arc"
                    strokeDasharray={`${2 * Math.PI * 52}`}
                    strokeDashoffset={`${2 * Math.PI * 52 * (1 - progress)}`}
                    transform="rotate(-90 60 60)"
                    fill="none"
                  />
                </svg>
              </div>
              {firstAction && (
                <p className="setup-lede">
                  First up: <b>{firstAction.title}</b> — {firstAction.timeWindow}.
                </p>
              )}
              <p className="setup-lede">
                {mode === "SHIFT"
                  ? "Your week is planned around the anchor sleep. The one thing you can move is the pickup."
                  : "Your plan starts when the crew runs it. Until then, the clock shows what doing nothing would cost you."}
              </p>
              {reveal && (
                <MascotSyncReveal
                  baseline={reveal.baseline}
                  target={reveal.target}
                  misalignmentHours={reveal.misalignmentHours}
                  baselineMisalignmentHours={reveal.baselineMisalignmentHours}
                  tone={state.tone}
                />
              )}
              <button type="button" className="dac-done" onClick={onComplete}>
                Enter →
              </button>
            </div>
          )}
        </div>

        {!isLast && (
          <div className="setup-foot">
            <button
              type="button"
              className="dial-btn"
              onClick={() => setSceneIdx((i) => Math.min(SCENES.length - 1, i + 1))}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      <DisclosureSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
