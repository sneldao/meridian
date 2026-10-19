"use client";

import React from "react";
import {
  getMascotCopy,
  type MascotState,
  type MascotTone,
} from "@/domain/evidence";

export interface SolLunaMascotProps {
  misalignmentHours: number;
  baselineMisalignmentHours: number;
  tone: MascotTone;
  onChangeTone?: (tone: MascotTone) => void;
  skippedToday?: boolean;
  onRepairSkip?: () => void;
  isShiftPostNightWarning?: boolean;
  compact?: boolean;
}

/**
 * Section 2 — The Mascot: One character living in the dial (half sun, half moon).
 * - Halves come into sync as the deterministic misalignment value drops.
 * - Driven strictly by misalignmentHours (never an invented wellness percentage).
 * - Visibly droops when a clock-moving nudge is skipped, offering a 1-tap repair.
 * - Includes a calm, unbothered state when misalignment <= 1.0h.
 * - Respects tone setting: gentle, cheeky (default), direct.
 */
export function SolLunaMascot({
  misalignmentHours,
  baselineMisalignmentHours,
  tone,
  onChangeTone,
  skippedToday = false,
  onRepairSkip,
  isShiftPostNightWarning = false,
  compact = false,
}: SolLunaMascotProps) {
  const state: MascotState = isShiftPostNightWarning
    ? "serious"
    : skippedToday
      ? "droop"
      : misalignmentHours <= 1.0
        ? "calm"
        : misalignmentHours <= 3.5
          ? "syncing"
          : "drifting";

  // Angular / vertical separation between Sun half and Moon half:
  // 0h misalignment -> 0px offset, 0 deg tilt (locked in sync).
  // 8h misalignment -> 14px offset, 16 deg tilt.
  const clampedHours = Math.min(10, Math.max(0, misalignmentHours));
  const splitOffsetPx = state === "calm" ? 0 : Math.round((clampedHours / 8) * 12);
  const droopPx = state === "droop" ? 7 : 0;
  const sunRotateDeg = state === "calm" ? 0 : -Math.round((clampedHours / 8) * 11);
  const moonRotateDeg =
    state === "droop"
      ? 18
      : state === "calm"
        ? 0
        : Math.round((clampedHours / 8) * 11);

  const speech = getMascotCopy({
    tone,
    state,
    misalignmentHours,
    baselineMisalignmentHours,
    isShiftPostNightWarning,
  });

  const stateBadgeLabel =
    state === "serious"
      ? "Safety focus"
      : state === "droop"
        ? "Slipped toward baseline"
        : state === "calm"
          ? "Halves in sync"
          : state === "syncing"
            ? "Halves converging"
            : "Halves out of phase";

  return (
    <div
      className="flex flex-col items-center text-center"
      aria-label={`Circadian mascot (${stateBadgeLabel}, illustrative mood from ${misalignmentHours.toFixed(1)}h estimated misalignment)`}
    >
      {/* SVG Half-Sun / Half-Moon Character */}
      <div className="relative flex items-center justify-center">
        <svg
          width={compact ? 84 : 104}
          height={compact ? 84 : 104}
          viewBox="0 0 120 120"
          role="img"
          aria-label={`Half-sun half-moon mascot showing ${misalignmentHours.toFixed(1)} hours misalignment`}
          className="overflow-visible transition-transform duration-500"
        >
          <defs>
            <clipPath id="left-sun-clip">
              <rect x="0" y="0" width="60" height="120" />
            </clipPath>
            <clipPath id="right-moon-clip">
              <rect x="60" y="0" width="60" height="120" />
            </clipPath>
            <radialGradient id="sun-glow" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="#FFE4B5" stopOpacity="0.85" />
              <stop offset="70%" stopColor="#D96B43" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#D96B43" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Soft ambient halo */}
          <circle cx="60" cy="60" r="52" fill="url(#sun-glow)" />

          {/* LEFT HALF: Warm Terracotta & Gold Sun */}
          <g
            clipPath="url(#left-sun-clip)"
            style={{
              transform: `translate(${-splitOffsetPx * 0.45}px, ${-splitOffsetPx * 0.25}px) rotate(${sunRotateDeg}deg)`,
              transformOrigin: "60px 60px",
              transition: "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {/* Sun rays on left semicircle */}
            {[150, 180, 210, 240, 120].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              const x1 = (60 + Math.cos(rad) * 38).toFixed(2);
              const y1 = (60 + Math.sin(rad) * 38).toFixed(2);
              const x2 = (60 + Math.cos(rad) * 47).toFixed(2);
              const y2 = (60 + Math.sin(rad) * 47).toFixed(2);
              return (
                <line
                  key={deg}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#D96B43"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                />
              );
            })}
            <circle
              cx="60"
              cy="60"
              r="34"
              fill="#F4A261"
              stroke="#1E1B18"
              strokeWidth="2.5"
            />
            {/* Warm cheek */}
            <circle cx="40" cy="66" r="5" fill="#D96B43" opacity="0.55" />
            {/* Left eye */}
            {state === "calm" ? (
              <path
                d="M41 54 Q46 49 51 54"
                fill="none"
                stroke="#1E1B18"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
            ) : state === "droop" ? (
              <path
                d="M41 55 Q46 58 51 55"
                fill="none"
                stroke="#1E1B18"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            ) : (
              <circle cx="46" cy="53" r="3.4" fill="#1E1B18" />
            )}
            {/* Left half mouth */}
            {state === "droop" ? (
              <path
                d="M48 73 Q54 68 60 70"
                fill="none"
                stroke="#1E1B18"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M47 68 Q53 75 60 74"
                fill="none"
                stroke="#1E1B18"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            )}
          </g>

          {/* RIGHT HALF: Deep Espresso-Indigo & Cream Moon */}
          <g
            clipPath="url(#right-moon-clip)"
            style={{
              transform: `translate(${splitOffsetPx * 0.45}px, ${splitOffsetPx * 0.35 + droopPx}px) rotate(${moonRotateDeg}deg)`,
              transformOrigin: "60px 60px",
              transition: "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {/* Tiny stars near moon side */}
            <circle cx="98" cy="34" r="2" fill="#2A6F4E" />
            <circle cx="103" cy="52" r="1.5" fill="#D96B43" />
            <circle
              cx="60"
              cy="60"
              r="34"
              fill="#2B2D42"
              stroke="#1E1B18"
              strokeWidth="2.5"
            />
            {/* Subtle moon craters */}
            <circle cx="78" cy="44" r="4" fill="#3E415C" opacity="0.7" />
            <circle cx="83" cy="68" r="3" fill="#3E415C" opacity="0.6" />
            {/* Right eye */}
            {state === "droop" ? (
              <path
                d="M69 56 Q74 60 79 56"
                fill="none"
                stroke="#F5EFE6"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            ) : state === "calm" ? (
              <path
                d="M69 54 Q74 49 79 54"
                fill="none"
                stroke="#F5EFE6"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
            ) : (
              <circle cx="74" cy="53" r="3.4" fill="#F5EFE6" />
            )}
            {/* Right half mouth */}
            {state === "droop" ? (
              <path
                d="M60 70 Q66 68 72 74"
                fill="none"
                stroke="#F5EFE6"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M60 74 Q67 75 73 68"
                fill="none"
                stroke="#F5EFE6"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
            )}
          </g>

          {/* Center seam line showing alignment / split */}
          <line
            x1="60"
            y1="22"
            x2="60"
            y2="98"
            stroke="#1E1B18"
            strokeWidth={state === "calm" ? "1.5" : "2"}
            strokeDasharray={state === "calm" ? "none" : "3 3"}
            opacity={state === "calm" ? 0.35 : 0.75}
          />
        </svg>
      </div>

      {/* State & Illustrative Honesty Tag */}
      <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[#e3d5c3] bg-[#fff8ef] px-2.5 py-0.5 text-[11px] font-bold text-[#5b4d41]">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            backgroundColor:
              state === "calm"
                ? "#2A6F4E"
                : state === "droop"
                  ? "#D96B43"
                  : "#F4A261",
          }}
        />
        <span>{stateBadgeLabel}</span>
        <span className="text-[#7a6a5c] font-normal">· Illustrative</span>
      </div>

      {/* Mascot Voice Line */}
      {!compact && (
        <p className="mt-2 max-w-[340px] text-[13px] font-medium leading-snug text-[#1E1B18]">
          “{speech}”
        </p>
      )}

      {/* One-Tap Repair button when a nudge was skipped */}
      {skippedToday && onRepairSkip && (
        <button
          type="button"
          onClick={onRepairSkip}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#1E1B18] px-3.5 py-1.5 text-xs font-bold text-[#F5EFE6] shadow-sm transition hover:bg-[#D96B43]"
        >
          <span>↻ 1-Tap Repair: Shift +30m into tomorrow&apos;s window</span>
        </button>
      )}

      {/* Tone Switcher (gentle / cheeky / direct) */}
      {!compact && onChangeTone && (
        <div
          className="mt-2.5 inline-flex items-center gap-1 rounded-full border border-[#e3d5c3] bg-[#f1e6d6] p-0.5 text-[11px]"
          role="group"
          aria-label="Mascot tone setting (simulated preference)"
        >
          <span className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#7a6a5c]">
            Tone:
          </span>
          {(["gentle", "cheeky", "direct"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChangeTone(t)}
              aria-pressed={tone === t}
              className={`rounded-full px-2.5 py-0.5 font-bold capitalize transition ${
                tone === t
                  ? "bg-[#1E1B18] text-[#F5EFE6]"
                  : "text-[#5b4d41] hover:text-[#1E1B18]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
