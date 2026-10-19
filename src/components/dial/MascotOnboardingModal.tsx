"use client";

import React, { useState } from "react";
import { fmtMin } from "@/domain/circadian";
import type { MascotTone } from "@/domain/evidence";
import { SolLunaMascot } from "./SolLunaMascot";

export interface OnboardingProfile {
  mode: "TRIP" | "SHIFT";
  usualBedMin: number;
  usualWakeMin: number;
  chronotype: "early" | "neutral" | "late";
  tripCommitmentMoved: boolean;
  shiftPartnerCoversPickup: boolean;
  wearableOptedIn: boolean;
  tone: MascotTone;
}

export interface MascotOnboardingModalProps {
  open: boolean;
  initialProfile: OnboardingProfile;
  onComplete: (profile: OnboardingProfile) => void;
  onClose: () => void;
}

const BEDTIME_OPTIONS = [
  { label: "22:30", min: 22 * 60 + 30 },
  { label: "23:15", min: 23 * 60 + 15 },
  { label: "23:55 (Seed)", min: 23 * 60 + 55 },
  { label: "00:30", min: 0 * 60 + 30 },
];

const WAKE_OPTIONS = [
  { label: "06:00", min: 6 * 60 },
  { label: "06:45 (Seed)", min: 6 * 60 + 45 },
  { label: "07:30", min: 7 * 60 + 30 },
  { label: "08:15", min: 8 * 60 + 15 },
];

/**
 * Phase 4 — 5-Step SolLuna Mascot Onboarding & Setup Flow:
 * 1. Mode Selection (TRIP: London → Tokyo vs SHIFT: Rotating Night Shifts + Childcare)
 * 2. Usual Sleep Baseline & Chronotype ("You told us")
 * 3. Non-Negotiable & Flexible Commitments (Dinner with Sarah / Afternoon School Pickup)
 * 4. Wearable & Data Provenance ("Estimated from schedule" vs "Simulated wearable import")
 * 5. Mascot Tone & Safety / Non-Medical Honesty Pledge
 */
export function MascotOnboardingModal({
  open,
  initialProfile,
  onComplete,
  onClose,
}: MascotOnboardingModalProps) {
  const [step, setStep] = useState<number>(1);
  const [draft, setDraft] = useState<OnboardingProfile>(initialProfile);

  if (!open) return null;

  const totalSteps = 5;

  const nextStep = () => {
    if (step < totalSteps) setStep(step + 1);
    else onComplete(draft);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  // Illustrative misalignment decreases as you progress through the 5 steps
  const previewMisalignment =
    step === 1 ? 6.5 : step === 2 ? 4.8 : step === 3 ? 3.2 : step === 4 ? 1.8 : 0.8;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mascot-onboarding-title"
      data-testid="mascot-onboarding-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E1B18]/60 p-4 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-xl overflow-hidden rounded-[28px] border border-[#e3d5c3] bg-[#FFF8EF] p-6 text-[#1E1B18] shadow-[0_30px_70px_-20px_rgba(30,27,24,0.55)]">
        {/* Top Progress Header */}
        <div className="flex items-center justify-between gap-2 border-b border-[#efe2d0] pb-3.5">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#D96B43] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-white">
              Step {step} of {totalSteps}
            </span>
            <span className="text-xs font-bold text-[#7a6a5c]">
              Meridian 24h Body-Clock Setup
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close onboarding"
            className="rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-3 py-1 text-xs font-bold text-[#5b4d41] transition hover:border-[#1E1B18] hover:text-[#1E1B18]"
          >
            Skip to dial ✕
          </button>
        </div>

        {/* Step Progress Dots */}
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-all ${
                s <= step ? "bg-[#D96B43]" : "bg-[#e8d9c4]"
              }`}
            />
          ))}
        </div>

        {/* Mascot + Step Header */}
        <div className="mt-4 flex flex-col items-center text-center sm:flex-row sm:text-left sm:gap-4">
          <div className="shrink-0">
            <SolLunaMascot
              misalignmentHours={previewMisalignment}
              baselineMisalignmentHours={8.0}
              tone={draft.tone}
              compact
            />
          </div>
          <div>
            <span className="inline-block rounded-full bg-[#f6dccb] px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#a8431e]">
              {step === 1 && "1 · Choose your planning mode"}
              {step === 2 && "2 · You told us · Habitual sleep"}
              {step === 3 && "3 · Commitments & real-life walls"}
              {step === 4 && "4 · Epistemic provenance & wearables"}
              {step === 5 && "5 · Mascot voice & safety guardrails"}
            </span>
            <h2
              id="mascot-onboarding-title"
              className="mt-1 text-xl font-extrabold leading-tight text-[#1E1B18]"
            >
              {step === 1 && "Are you crossing timezones or working rotating shifts?"}
              {step === 2 && "When does your body usually expect to sleep?"}
              {step === 3 && "Which real-world commitments should Meridian protect?"}
              {step === 4 && "How should Meridian estimate your body-clock phase?"}
              {step === 5 && "Pick SolLuna’s tone & review our honesty pledge"}
            </h2>
          </div>
        </div>

        {/* Step Body */}
        <div className="mt-4 rounded-2xl border border-[#e3d5c3] bg-[#f5efe6] p-4">
          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, mode: "TRIP" }))}
                aria-pressed={draft.mode === "TRIP"}
                className={`rounded-2xl border p-4 text-left transition ${
                  draft.mode === "TRIP"
                    ? "border-[#D96B43] bg-[#FFF8EF] shadow-sm ring-2 ring-[#D96B43]/30"
                    : "border-[#d8c6ae] bg-[#FFF8EF]/60 hover:border-[#1E1B18]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-extrabold text-[#1E1B18]">
                    ✈️ TRIP Mode
                  </span>
                  {draft.mode === "TRIP" && (
                    <span className="rounded-full bg-[#D96B43] px-2 py-0.5 text-[10px] font-extrabold text-white">
                      Selected
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#5b4d41]">
                  <strong>London (LHR) → Tokyo (HND)</strong> (+8h East in BST / +9h from 25 Oct GMT). Shifts your clock ~1–1.5h/day before &amp; after flight.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, mode: "SHIFT" }))}
                aria-pressed={draft.mode === "SHIFT"}
                className={`rounded-2xl border p-4 text-left transition ${
                  draft.mode === "SHIFT"
                    ? "border-[#D96B43] bg-[#FFF8EF] shadow-sm ring-2 ring-[#D96B43]/30"
                    : "border-[#d8c6ae] bg-[#FFF8EF]/60 hover:border-[#1E1B18]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-extrabold text-[#1E1B18]">
                    🏥 SHIFT Mode
                  </span>
                  {draft.mode === "SHIFT" && (
                    <span className="rounded-full bg-[#D96B43] px-2 py-0.5 text-[10px] font-extrabold text-white">
                      Selected
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[#5b4d41]">
                  <strong>7-Day Rotating Night Shifts + Childcare.</strong> Balances 22:00–06:00 hospital rota against fixed 07:45 school drop-off &amp; afternoon pickup.
                </p>
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-extrabold uppercase tracking-wider text-[#5b4d41]">
                  Usual Bedtime (You told us)
                </label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {BEDTIME_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({ ...d, usualBedMin: opt.min }))
                      }
                      className={`rounded-full border px-3 py-1.5 font-bold transition ${
                        draft.usualBedMin === opt.min
                          ? "border-[#1E1B18] bg-[#1E1B18] text-[#F5EFE6]"
                          : "border-[#d8c6ae] bg-[#FFF8EF] text-[#1E1B18]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-extrabold uppercase tracking-wider text-[#5b4d41]">
                  Usual Wake Time (You told us)
                </label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {WAKE_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() =>
                        setDraft((d) => ({ ...d, usualWakeMin: opt.min }))
                      }
                      className={`rounded-full border px-3 py-1.5 font-bold transition ${
                        draft.usualWakeMin === opt.min
                          ? "border-[#1E1B18] bg-[#1E1B18] text-[#F5EFE6]"
                          : "border-[#d8c6ae] bg-[#FFF8EF] text-[#1E1B18]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-extrabold uppercase tracking-wider text-[#5b4d41]">
                  Self-Reported Chronotype
                </label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(["early", "neutral", "late"] as const).map((ct) => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, chronotype: ct }))}
                      className={`rounded-full border px-3.5 py-1.5 font-bold capitalize transition ${
                        draft.chronotype === ct
                          ? "border-[#D96B43] bg-[#D96B43] text-white"
                          : "border-[#d8c6ae] bg-[#FFF8EF] text-[#1E1B18]"
                      }`}
                    >
                      {ct === "neutral" ? "Intermediate" : ct} bird/owl
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-[#7a6a5c]">
                Current baseline window: <strong>{fmtMin(draft.usualBedMin)}–{fmtMin(draft.usualWakeMin)}</strong>. Shown on the 24-hour dial as your faint dashed ghost arc.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-xs">
              <p className="text-[#5b4d41]">
                Meridian <strong>never silently overwrites</strong> fixed commitments. Instead, it shows the sleep trade-off on the dial and lets you test what happens if a flexible commitment moves:
              </p>

              <div className="rounded-xl border border-[#e3d5c3] bg-[#FFF8EF] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-[#1E1B18]">
                      ✈️ TRIP Seed: D-1 Dinner with Sarah (19:30–21:30)
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#5b4d41]">
                      Keeping dinner at 19:30 caps D-1 bedtime at 21:45 (-60m shift). Moving dinner to 18:00 unlocks 21:00 sleep (-90m shift).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        tripCommitmentMoved: !d.tripCommitmentMoved,
                      }))
                    }
                    className={`shrink-0 rounded-full px-3 py-1.5 font-extrabold transition ${
                      draft.tripCommitmentMoved
                        ? "bg-[#2A6F4E] text-white"
                        : "bg-[#1E1B18] text-[#F5EFE6]"
                    }`}
                  >
                    {draft.tripCommitmentMoved
                      ? "✓ Moved to 18:00"
                      : "Keep at 19:30"}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-[#e3d5c3] bg-[#FFF8EF] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-[#1E1B18]">
                      🏥 SHIFT Seed: 15:30 Afternoon School Pickup
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#5b4d41]">
                      Morning 07:45 drop-off is fixed. If a partner covers the 15:30 pickup after Night 3, daytime anchor sleep extends from 08:30–14:45 to 16:00 (+75m).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        shiftPartnerCoversPickup: !d.shiftPartnerCoversPickup,
                      }))
                    }
                    className={`shrink-0 rounded-full px-3 py-1.5 font-extrabold transition ${
                      draft.shiftPartnerCoversPickup
                        ? "bg-[#2A6F4E] text-white"
                        : "bg-[#1E1B18] text-[#F5EFE6]"
                    }`}
                  >
                    {draft.shiftPartnerCoversPickup
                      ? "✓ Partner covers"
                      : "I do pickup"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3 text-xs">
              <p className="text-[#5b4d41]">
                Every number in Meridian carries an explicit epistemic tag: <strong>You told us</strong>, <strong>Measured</strong>, <strong>Estimated</strong>, <strong>Recommended</strong>, or <strong>Unknown</strong>.
              </p>
              <div className="rounded-xl border border-[#e3d5c3] bg-[#FFF8EF] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-[#1E1B18]">
                    Simulated Wearable Sleep &amp; HR Import
                  </span>
                  <span className="rounded-full bg-[#f6dccb] px-2.5 py-0.5 text-[10px] font-extrabold text-[#a8431e]">
                    {draft.wearableOptedIn
                      ? "±0.7h phase band"
                      : "±0.9h phase band"}
                  </span>
                </div>
                <p className="mt-1 text-[#5b4d41]">
                  Without laboratory dim-light melatonin onset (DLMO), body-clock phase is always an <strong>uncertainty band</strong> on the dial—never a single line. Opting into simulated wearable history narrows the band from ±0.9h to ±0.7h.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      wearableOptedIn: !d.wearableOptedIn,
                    }))
                  }
                  className={`mt-2.5 rounded-full border px-3.5 py-1.5 font-extrabold transition ${
                    draft.wearableOptedIn
                      ? "border-[#2A6F4E] bg-[#2A6F4E] text-white"
                      : "border-[#1E1B18] bg-[#f5efe6] text-[#1E1B18]"
                  }`}
                >
                  {draft.wearableOptedIn
                    ? "✓ Simulated wearable import enabled"
                    : "Opt in to simulated wearable import"}
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-extrabold uppercase tracking-wider text-[#5b4d41]">
                  SolLuna Mascot Voice Tone
                </label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {(["gentle", "cheeky", "direct"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, tone: t }))}
                      className={`rounded-full border px-3.5 py-1.5 font-extrabold capitalize transition ${
                        draft.tone === t
                          ? "border-[#1E1B18] bg-[#1E1B18] text-[#F5EFE6]"
                          : "border-[#d8c6ae] bg-[#FFF8EF] text-[#1E1B18]"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-[#e3d5c3] bg-[#FFF8EF] p-3 text-[11px] leading-relaxed text-[#5b4d41]">
                <strong className="text-[#1E1B18]">
                  Non-Medical &amp; Safety Guardrails:
                </strong>{" "}
                Meridian is a deterministic circadian timing planner, not a medical device. It never recommends melatonin or supplement dosing (ask a clinician), distinguishes phase-shifting nudges (<em>Moves your clock</em>) from symptom comfort (<em>Helps you feel better</em>), and switches off humour for post-night-shift driving warnings.
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={prevStep}
            disabled={step === 1}
            className="rounded-full border border-[#1E1B18] px-4 py-2 text-xs font-extrabold text-[#1E1B18] transition hover:bg-[#1E1B18] hover:text-[#F5EFE6] disabled:opacity-35"
          >
            ← Back
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onComplete(draft)}
              className="rounded-full bg-[#D96B43] px-5 py-2.5 text-xs font-extrabold text-white shadow-sm transition hover:bg-[#c45a34]"
            >
              {step === totalSteps ? "Launch 24h Dial →" : "Apply & Finish"}
            </button>
            {step < totalSteps && (
              <button
                type="button"
                onClick={nextStep}
                className="rounded-full bg-[#1E1B18] px-4 py-2.5 text-xs font-extrabold text-[#F5EFE6] transition hover:bg-[#D96B43]"
              >
                Next step →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
