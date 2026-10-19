"use client";

import React, { useState } from "react";
import { fmtMin } from "@/domain/circadian";
import { getEvidenceForKind, type MascotTone } from "@/domain/evidence";
import { wrapClockMin } from "@/domain/misalignment";
import type { InterventionKind } from "@/domain/types";
import { SolLunaMascot } from "./SolLunaMascot";

export interface DialMark {
  id: string;
  kind: InterventionKind | "hydration";
  label: string;
  startMin: number;
  endMin?: number;
  note: string;
  isPrimary?: boolean;
}

export interface DialCommitmentNotch {
  id: string;
  title: string;
  startMin: number;
  endMin: number;
  fixed: boolean;
  blocksWindow?: boolean;
  tradeOffNote?: string;
}

export interface CircadianDialProps {
  dayLabel: string;
  mode: "TRIP" | "SHIFT";
  /** Planned sleep window (solid arc). */
  plannedSleepStartMin: number;
  plannedSleepEndMin: number;
  /** Optional secondary recovery nap arc. */
  napWindow?: { startMin: number; endMin: number; label: string };
  /** Target night (destination night in TRIP, recommended anchor window in SHIFT). */
  targetNightStartMin: number;
  targetNightEndMin: number;
  /** Usual habitual sleep (faint ghost arc). */
  usualSleepStartMin: number;
  usualSleepEndMin: number;
  /** Estimated body-clock phase window + uncertainty half-width in minutes (BAND, not a line). */
  estimatedBodyStartMin: number;
  estimatedBodyEndMin: number;
  uncertaintyHalfWidthMin: number;
  /** Headline misalignment hours + range + baseline comparison. */
  misalignmentHours: number;
  misalignmentLowHours: number;
  misalignmentHighHours: number;
  baselineMisalignmentHours: number;
  /** Commitments shown as perimeter notches. */
  commitments: DialCommitmentNotch[];
  /** Secondary nudges shown as small marks on the dial. */
  marks: DialMark[];
  /** Mascot props. */
  tone: MascotTone;
  onChangeTone: (tone: MascotTone) => void;
  skippedToday: boolean;
  onRepairSkip: () => void;
  isShiftPostNightWarning?: boolean;
  wearableOptedIn?: boolean;
}

/**
 * Convert minutes since 00:00 [0, 1440) to angle in degrees where:
 * - 00:00 (midnight) = -90 deg (top, 12 o'clock)
 * - 06:00 = 0 deg (right, 3 o'clock)
 * - 12:00 (noon) = +90 deg (bottom, 6 o'clock)
 * - 18:00 = 180 deg (left, 9 o'clock)
 */
function minToAngleDeg(min: number): number {
  const m = wrapClockMin(min);
  return (m / 1440) * 360 - 90;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/**
 * Builds an SVG circular arc path clockwise from `startMin` to `endMin`,
 * handling wraparound across midnight seamlessly.
 */
function describeClockArc(
  cx: number,
  cy: number,
  r: number,
  startMin: number,
  endMin: number,
): string {
  const s = wrapClockMin(startMin);
  const e = wrapClockMin(endMin);
  const durationMin = wrapClockMin(e - s);
  if (durationMin <= 0) return "";
  if (durationMin >= 1439) {
    // Full circle fallback
    return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`;
  }
  const startAngle = minToAngleDeg(s);
  const endAngle = startAngle + (durationMin / 1440) * 360;
  const startPt = polarToCartesian(cx, cy, r, startAngle);
  const endPt = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = durationMin > 720 ? 1 : 0;
  return `M ${startPt.x.toFixed(2)} ${startPt.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${endPt.x.toFixed(2)} ${endPt.y.toFixed(2)}`;
}

/**
 * Section 1 — The Signature 24-Hour Dial.
 * - Midnight at the top, noon at the bottom. Moon near midnight, sun near noon.
 * - Arcs:
 *   1. Planned sleep (solid terracotta/espresso)
 *   2. Target night (destination-local night in TRIP, recommended sleep window in SHIFT)
 *   3. Usual sleep (faint dashed ghost)
 *   4. Estimated body-clock phase BAND (width = uncertainty, explicitly labelled as an estimate)
 * - Commitments appear as perimeter notches with trade-off inspection.
 * - Secondary nudges appear as small non-competing marks on the dial.
 */
export function CircadianDial({
  dayLabel,
  mode,
  plannedSleepStartMin,
  plannedSleepEndMin,
  napWindow,
  targetNightStartMin,
  targetNightEndMin,
  usualSleepStartMin,
  usualSleepEndMin,
  estimatedBodyStartMin,
  estimatedBodyEndMin,
  uncertaintyHalfWidthMin,
  misalignmentHours,
  misalignmentLowHours,
  misalignmentHighHours,
  baselineMisalignmentHours,
  commitments,
  marks,
  tone,
  onChangeTone,
  skippedToday,
  onRepairSkip,
  isShiftPostNightWarning = false,
  wearableOptedIn = false,
}: CircadianDialProps) {
  const [selectedItem, setSelectedItem] = useState<
    | { type: "mark"; item: DialMark }
    | { type: "commitment"; item: DialCommitmentNotch }
    | { type: "band" }
    | null
  >(null);
  const [showTextAlternative, setShowTextAlternative] = useState(false);

  const cx = 210;
  const cy = 210;
  const rOuterNotch = 182;
  const rTargetNight = 164;
  const rPlannedSleep = 146;
  const rUsualGhost = 130;
  const rPhaseBand = 112;

  // Uncertainty band widens the estimated body-clock phase arc on both ends
  const bandOuterStart = wrapClockMin(estimatedBodyStartMin - uncertaintyHalfWidthMin);
  const bandOuterEnd = wrapClockMin(estimatedBodyEndMin + uncertaintyHalfWidthMin);

  const uncertaintyHoursLabel = `±${(uncertaintyHalfWidthMin / 60).toFixed(1)}h`;

  return (
    <section
      aria-label={`24-hour circadian dial for ${dayLabel}`}
      className="rounded-[28px] border border-[#e3d5c3] bg-[#FFF8EF] p-5 shadow-[0_20px_44px_-22px_rgba(30,27,24,0.22)] sm:p-6"
    >
      {/* Top Headline Row: Misalignment Readout + Epistemic Provenance */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#efe2d0] pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-[#f6dccb] px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-[#a8431e]">
              Estimated
            </span>
            <span className="text-xs font-semibold text-[#7a6a5c]">
              {wearableOptedIn
                ? "Estimated from your data (simulated wearable)"
                : "Estimated from schedule you told us"}
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <span
              className="text-3xl font-extrabold tracking-tight text-[#1E1B18] sm:text-4xl"
              data-testid="headline-misalignment-hours"
            >
              {misalignmentHours.toFixed(1)}h
            </span>
            <span className="text-sm font-bold text-[#5b4d41]">
              estimated circadian misalignment
            </span>
          </div>
          <p className="mt-0.5 text-xs font-medium text-[#7a6a5c]">
            Range:{" "}
            <strong className="text-[#1E1B18]">
              {misalignmentLowHours.toFixed(1)}–{misalignmentHighHours.toFixed(1)}h
            </strong>{" "}
            ({uncertaintyHoursLabel} uncertainty band) · vs.{" "}
            <strong className="text-[#1E1B18]">
              {baselineMisalignmentHours.toFixed(1)}h
            </strong>{" "}
            with no pre-adjustment
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowTextAlternative((v) => !v)}
          aria-expanded={showTextAlternative}
          className="rounded-full border border-[#d8c6ae] bg-[#f5efe6] px-3 py-1.5 text-xs font-bold text-[#1E1B18] transition hover:border-[#D96B43]"
        >
          {showTextAlternative ? "Hide text schedule & math" : "Text schedule & math"}
        </button>
      </div>

      {/* Main 24-Hour Circular Dial + Center Mascot */}
      <div className="relative mx-auto my-2 flex max-w-[440px] flex-col items-center justify-center">
        <svg
          viewBox="0 0 420 420"
          className="h-auto w-full max-w-[410px] select-none"
          role="img"
          aria-label={`24-hour clock dial with midnight at top and noon at bottom. Planned sleep ${fmtMin(plannedSleepStartMin)} to ${fmtMin(plannedSleepEndMin)}, target night ${fmtMin(targetNightStartMin)} to ${fmtMin(targetNightEndMin)}, usual sleep ${fmtMin(usualSleepStartMin)} to ${fmtMin(usualSleepEndMin)}, and estimated body-clock phase band with ${uncertaintyHoursLabel} uncertainty.`}
        >
          {/* Background dial plate */}
          <circle
            cx={cx}
            cy={cy}
            r={rOuterNotch + 12}
            fill="#FAF3E8"
            stroke="#E3D5C3"
            strokeWidth="1.5"
          />

          {/* 24-hour tick marks around perimeter */}
          {Array.from({ length: 24 }, (_, hour) => {
            const angle = minToAngleDeg(hour * 60);
            const isMajor = hour % 6 === 0;
            const p1 = polarToCartesian(cx, cy, isMajor ? 174 : 178, angle);
            const p2 = polarToCartesian(cx, cy, 185, angle);
            return (
              <line
                key={hour}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={isMajor ? "#1E1B18" : "#C9B79C"}
                strokeWidth={isMajor ? 2 : 1}
              />
            );
          })}

          {/* Cardinal Clock Labels: Midnight (00:00 top), 06:00 (right), Noon (12:00 bottom), 18:00 (left) */}
          <g className="text-[11px] font-extrabold fill-[#1E1B18]">
            <text x={cx} y={16} textAnchor="middle">
              🌙 00:00 Midnight
            </text>
            <text x={404} y={cy + 4} textAnchor="end">
              06:00
            </text>
            <text x={cx} y={412} textAnchor="middle">
              ☀️ 12:00 Noon
            </text>
            <text x={16} y={cy + 4} textAnchor="start">
              18:00
            </text>
          </g>

          {/* Guide tracks */}
          <circle
            cx={cx}
            cy={cy}
            r={rTargetNight}
            fill="none"
            stroke="#EFE2D0"
            strokeWidth="12"
          />
          <circle
            cx={cx}
            cy={cy}
            r={rPlannedSleep}
            fill="none"
            stroke="#EFE2D0"
            strokeWidth="12"
          />
          <circle
            cx={cx}
            cy={cy}
            r={rUsualGhost}
            fill="none"
            stroke="#F2E8D9"
            strokeWidth="6"
          />
          <circle
            cx={cx}
            cy={cy}
            r={rPhaseBand}
            fill="none"
            stroke="#F2E8D9"
            strokeWidth="16"
          />

          {/* 1. TARGET NIGHT ARC (Destination night in TRIP / Anchor target in SHIFT) */}
          <path
            d={describeClockArc(cx, cy, rTargetNight, targetNightStartMin, targetNightEndMin)}
            fill="none"
            stroke="#2B2D42"
            strokeWidth="12"
            strokeLinecap="round"
            opacity="0.82"
          />

          {/* 2. USUAL SLEEP GHOST ARC (Faint dashed baseline) */}
          <path
            d={describeClockArc(cx, cy, rUsualGhost, usualSleepStartMin, usualSleepEndMin)}
            fill="none"
            stroke="#8C7A6B"
            strokeWidth="5"
            strokeDasharray="6 6"
            strokeLinecap="round"
            opacity="0.65"
          />

          {/* 3. PLANNED SLEEP ARC (Solid Terracotta) */}
          <path
            d={describeClockArc(cx, cy, rPlannedSleep, plannedSleepStartMin, plannedSleepEndMin)}
            fill="none"
            stroke="#D96B43"
            strokeWidth="12"
            strokeLinecap="round"
          />

          {/* Optional Recovery Nap Window Arc */}
          {napWindow && (
            <path
              d={describeClockArc(cx, cy, rPlannedSleep, napWindow.startMin, napWindow.endMin)}
              fill="none"
              stroke="#D96B43"
              strokeWidth="9"
              strokeDasharray="10 4"
              strokeLinecap="round"
            />
          )}

          {/* 4. ESTIMATED BODY-CLOCK PHASE BAND (Wide uncertainty halo + inner estimated band, NEVER a thin line) */}
          <g
            className="cursor-pointer"
            onClick={() => setSelectedItem({ type: "band" })}
          >
            {/* Outer uncertainty envelope */}
            <path
              d={describeClockArc(cx, cy, rPhaseBand, bandOuterStart, bandOuterEnd)}
              fill="none"
              stroke="#F4A261"
              strokeWidth="18"
              strokeLinecap="round"
              opacity="0.32"
            />
            {/* Core estimated body-clock phase band */}
            <path
              d={describeClockArc(
                cx,
                cy,
                rPhaseBand,
                estimatedBodyStartMin,
                estimatedBodyEndMin,
              )}
              fill="none"
              stroke="#E76F51"
              strokeWidth="10"
              strokeDasharray="3 5"
              strokeLinecap="round"
              opacity="0.78"
            />
          </g>

          {/* 5. COMMITMENT NOTCHES ON OUTER RING */}
          {commitments.map((c) => {
            const arcPath = describeClockArc(
              cx,
              cy,
              rOuterNotch,
              c.startMin,
              c.endMin,
            );
            const midMin = wrapClockMin(
              c.startMin + wrapClockMin(c.endMin - c.startMin) / 2,
            );
            const badgePos = polarToCartesian(
              cx,
              cy,
              rOuterNotch + 6,
              minToAngleDeg(midMin),
            );
            return (
              <g
                key={c.id}
                className="cursor-pointer"
                onClick={() => setSelectedItem({ type: "commitment", item: c })}
              >
                <path
                  d={arcPath}
                  fill="none"
                  stroke={
                    c.blocksWindow
                      ? "#B91C1C"
                      : c.fixed
                        ? "#1E1B18"
                        : "#2A6F4E"
                  }
                  strokeWidth="8"
                  strokeLinecap="butt"
                />
                <circle
                  cx={badgePos.x}
                  cy={badgePos.y}
                  r={c.blocksWindow ? 6.5 : 5}
                  fill={
                    c.blocksWindow
                      ? "#B91C1C"
                      : c.fixed
                        ? "#1E1B18"
                        : "#2A6F4E"
                  }
                  stroke="#FFF8EF"
                  strokeWidth="1.5"
                />
              </g>
            );
          })}

          {/* 6. SECONDARY NUDGE MARKS ON THE DIAL */}
          {marks.map((m) => {
            const angle = minToAngleDeg(m.startMin);
            const pos = polarToCartesian(cx, cy, rPlannedSleep, angle);
            const isClockMover =
              m.kind === "light_exposure" ||
              m.kind === "avoid_light" ||
              m.kind === "sleep_window" ||
              m.kind === "nap";
            const fill =
              m.kind === "light_exposure"
                ? "#F4A261"
                : m.kind === "avoid_light"
                  ? "#2B2D42"
                  : isClockMover
                    ? "#D96B43"
                    : "#2A6F4E";
            return (
              <g
                key={m.id}
                className="cursor-pointer"
                onClick={() => setSelectedItem({ type: "mark", item: m })}
              >
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={m.isPrimary ? 10 : 7.5}
                  fill={fill}
                  stroke="#FFF8EF"
                  strokeWidth="2.5"
                />
                <text
                  x={pos.x}
                  y={pos.y + 3.5}
                  textAnchor="middle"
                  fontSize="9"
                  fontWeight="800"
                  fill="#FFF8EF"
                >
                  {m.kind === "light_exposure"
                    ? "☀"
                    : m.kind === "avoid_light"
                      ? "◐"
                      : m.kind === "caffeine_cutoff"
                        ? "☕"
                        : m.kind === "exercise"
                          ? "🏃"
                          : "•"}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Center Overlay: The Half-Sun / Half-Moon Mascot living inside the dial */}
        <div className="mt-1 flex flex-col items-center">
          <SolLunaMascot
            misalignmentHours={misalignmentHours}
            baselineMisalignmentHours={baselineMisalignmentHours}
            tone={tone}
            onChangeTone={onChangeTone}
            skippedToday={skippedToday}
            onRepairSkip={onRepairSkip}
            isShiftPostNightWarning={isShiftPostNightWarning}
          />
        </div>
      </div>

      {/* Accessible Legend + Interactive Quick-Inspect Buttons for Dial Elements */}
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#efe2d0] pt-3 text-xs sm:grid-cols-4">
        <div className="flex items-center gap-2 rounded-xl bg-[#f5efe6] px-2.5 py-2">
          <span className="h-3 w-5 rounded-full bg-[#D96B43]" />
          <div>
            <div className="font-extrabold text-[#1E1B18]">Planned sleep</div>
            <div className="text-[11px] text-[#5b4d41]">
              {fmtMin(plannedSleepStartMin)}–{fmtMin(plannedSleepEndMin)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-[#f5efe6] px-2.5 py-2">
          <span className="h-3 w-5 rounded-full bg-[#2B2D42]" />
          <div>
            <div className="font-extrabold text-[#1E1B18]">
              {mode === "TRIP" ? "Target dest. night" : "Target anchor"}
            </div>
            <div className="text-[11px] text-[#5b4d41]">
              {fmtMin(targetNightStartMin)}–{fmtMin(targetNightEndMin)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl bg-[#f5efe6] px-2.5 py-2">
          <span className="h-2 w-5 rounded-full border border-dashed border-[#5b4d41] bg-[#d8c6ae]" />
          <div>
            <div className="font-extrabold text-[#1E1B18]">Usual sleep</div>
            <div className="text-[11px] text-[#5b4d41]">
              {fmtMin(usualSleepStartMin)}–{fmtMin(usualSleepEndMin)}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            setSelectedItem(selectedItem?.type === "band" ? null : { type: "band" })
          }
          className="flex items-center gap-2 rounded-xl border border-[#f4a261] bg-[#fff3e2] px-2.5 py-2 text-left transition hover:bg-[#fde8c9]"
        >
          <span className="h-3.5 w-5 rounded-full bg-[#F4A261]/70 ring-2 ring-[#E76F51]/50" />
          <div>
            <div className="font-extrabold text-[#1E1B18]">
              Est. body phase
            </div>
            <div className="text-[11px] text-[#a8431e]">
              Band {uncertaintyHoursLabel} (tap)
            </div>
          </div>
        </button>
      </div>

      {/* Interactive Secondary Marks & Commitment Notches Pill Row (Keyboard Accessible) */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#7a6a5c]">
          On the dial:
        </span>
        {marks.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setSelectedItem({ type: "mark", item: m })}
            className="inline-flex items-center gap-1 rounded-full border border-[#e3d5c3] bg-[#f5efe6] px-2.5 py-1 text-[11px] font-bold text-[#1E1B18] transition hover:border-[#D96B43]"
          >
            <span>
              {m.kind === "light_exposure"
                ? "☀️"
                : m.kind === "avoid_light"
                  ? "🕶️"
                  : m.kind === "caffeine_cutoff"
                    ? "☕"
                    : m.kind === "exercise"
                      ? "🏃"
                      : "🌙"}
            </span>
            <span>{m.label}</span>
            <span className="text-[#7a6a5c]">{fmtMin(m.startMin)}</span>
          </button>
        ))}
        {commitments.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelectedItem({ type: "commitment", item: c })}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
              c.blocksWindow
                ? "border-[#B91C1C] bg-[#FEE2E2] text-[#7F1D1D]"
                : c.fixed
                  ? "border-[#1E1B18] bg-[#1E1B18] text-[#F5EFE6]"
                  : "border-[#2A6F4E] bg-[#E8F5EE] text-[#1B4D35]"
            }`}
          >
            <span>{c.fixed ? "🔒" : "↔"}</span>
            <span>{c.title}</span>
            <span className="opacity-80">
              {fmtMin(c.startMin)}–{fmtMin(c.endMin)}
            </span>
          </button>
        ))}
      </div>

      {/* Selected Dial Mark / Commitment / Phase Band Inspector Drawer */}
      {selectedItem && (
        <div
          role="region"
          aria-label="Selected dial item details"
          className="mt-3 rounded-2xl border border-[#d8c6ae] bg-[#f1e6d6] p-3.5 text-xs text-[#1E1B18]"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              {selectedItem.type === "band" && (
                <>
                  <div className="font-extrabold uppercase tracking-wider text-[#a8431e]">
                    Estimated Body-Clock Phase Band ({uncertaintyHoursLabel})
                  </div>
                  <p className="mt-1 leading-relaxed text-[#5b4d41]">
                    Meridian represents your body clock as a{" "}
                    <strong>probability band</strong> ({fmtMin(bandOuterStart)}–
                    {fmtMin(bandOuterEnd)}), never a single precise line. Without a
                    laboratory dim-light melatonin onset (DLMO) assay, circadian
                    phase is estimated from your habitual sleep and light history.
                  </p>
                </>
              )}
              {selectedItem.type === "mark" && (
                <>
                  {(() => {
                    const ev = getEvidenceForKind(selectedItem.item.kind);
                    return (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                              ev.channel === "moves_clock"
                                ? "bg-[#D96B43] text-white"
                                : "bg-[#2A6F4E] text-white"
                            }`}
                          >
                            {ev.channelLabel}
                          </span>
                          <span className="font-extrabold text-[#1E1B18]">
                            {selectedItem.item.label} ({fmtMin(selectedItem.item.startMin)}
                            {selectedItem.item.endMin
                              ? `–${fmtMin(selectedItem.item.endMin)}`
                              : ""}
                            )
                          </span>
                        </div>
                        <p className="mt-1 text-[#1E1B18]">{selectedItem.item.note}</p>
                        <div className="mt-1.5 grid gap-1 text-[11px] text-[#5b4d41] sm:grid-cols-2">
                          <div>
                            <strong>How it works:</strong> {ev.howItWorks}
                          </div>
                          <div>
                            <strong>In real trips:</strong> {ev.inRealTrips}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
              {selectedItem.type === "commitment" && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#1E1B18] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#F5EFE6]">
                      You told us · {selectedItem.item.fixed ? "Fixed commitment" : "Flexible commitment"}
                    </span>
                    <span className="font-extrabold">
                      {selectedItem.item.title} ({fmtMin(selectedItem.item.startMin)}–
                      {fmtMin(selectedItem.item.endMin)})
                    </span>
                  </div>
                  <p className="mt-1 text-[#5b4d41]">
                    {selectedItem.item.tradeOffNote ||
                      (selectedItem.item.fixed
                        ? "Fixed wall: Meridian routes light and sleep around this commitment without overwriting it."
                        : "Negotiable block: can be shifted if it collides with a primary light or sleep window.")}
                  </p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedItem(null)}
              className="rounded-full bg-[#e3d5c3] px-2.5 py-1 text-[11px] font-bold text-[#1E1B18]"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Accessible Text Alternative & Deterministic Calculation Inspector */}
      {showTextAlternative && (
        <div
          className="mt-3 rounded-2xl border border-[#d8c6ae] bg-[#f5efe6] p-4 text-xs leading-relaxed text-[#1E1B18]"
          data-testid="dial-math-inspector"
        >
          <div className="font-extrabold uppercase tracking-wider text-[#D96B43]">
            Deterministic Circadian Calculation &amp; Text Alternative
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[#5b4d41]">
            <li>
              <strong>What misalignment represents:</strong> The circular distance on
              a 24-hour clock between your estimated body-clock sleep midpoint and
              your target night midpoint (wrapped across midnight so 23:30 vs 01:00
              is 1.5h, not 22.5h).
            </li>
            <li>
              <strong>What it does NOT represent:</strong> It is not a direct lab
              measurement of melatonin/core temperature, nor a percentage guarantee
              of cognitive alertness.
            </li>
            <li>
              <strong>Today&apos;s arcs ({dayLabel}):</strong> Planned sleep{" "}
              {fmtMin(plannedSleepStartMin)}–{fmtMin(plannedSleepEndMin)} · Target
              night {fmtMin(targetNightStartMin)}–{fmtMin(targetNightEndMin)} · Usual
              habitual sleep {fmtMin(usualSleepStartMin)}–{fmtMin(usualSleepEndMin)} ·
              Estimated body phase {fmtMin(estimatedBodyStartMin)}–
              {fmtMin(estimatedBodyEndMin)} ({uncertaintyHoursLabel} uncertainty).
            </li>
            <li>
              <strong>Baseline comparison:</strong> {misalignmentHours.toFixed(1)}h
              projected vs. {baselineMisalignmentHours.toFixed(1)}h under a
              no-pre-adjustment baseline (0h pre-flight shift, ~45m/day passive
              post-landing adaptation).
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}
