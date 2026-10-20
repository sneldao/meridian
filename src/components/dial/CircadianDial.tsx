"use client";

// The 24-hour dial.
//
// A picture of the body clock, not a picture of the plan. The arcs are:
//
//   · the target night — where the plan is aiming (the destination's night,
//     or the night a shift week is working towards)
//   · the ghost arc — the wearer's usual sleep, for comparison
//   · the planned sleep — what the plan asks for today
//   · the modelled body clock, drawn as a band, never a line: the width is
//     the model's own uncertainty, and a body clock is never known to the
//     minute
//   · commitment notches on the perimeter — solid for fixed, dashed for
//     movable
//   · the secondary nudges as small marks
//
// Midnight is at the top and noon at the bottom, because that is the way a
// night worker and a traveller both read a day.
//
// The whole thing is also available as a list, because a dial is not an
// accessible way to read a number, and the numbers are the point.

import { useId, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import { getEvidenceForKind, type EpistemicTag } from "@/domain/evidence";
import { type MascotTone } from "@/domain/mascot";
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
  /** Fixed commitments are solid; movable ones are dashed. */
  fixed: boolean;
  tradeOffNote?: string;
}

export interface DialWindow {
  startMin: number;
  endMin: number;
}

export interface CircadianDialProps {
  dayLabel: string;
  mode: "TRIP" | "SHIFT";
  /** The sleep the plan asks for today. */
  plannedSleep: DialWindow;
  /** The night this plan is aiming at. */
  targetNight: DialWindow;
  /** The wearer's usual sleep — the ghost arc. */
  usualSleep: DialWindow;
  /** The modelled body clock. */
  estimatedBody: DialWindow;
  /** Half-width of the model's uncertainty, in minutes. */
  uncertaintyHalfWidthMin: number;
  /** The headline: hours off the target, with its range and the do-nothing
   *  baseline beside it. */
  misalignmentHours: number;
  /** What the headline measures. Travel reads "off target"; a shift week
   *  reads "of delay owed", because a night worker is hours behind the
   *  night rather than hours off a target. */
  metricLabel?: string;
  misalignmentLowHours: number;
  misalignmentHighHours: number;
  baselineMisalignmentHours: number;
  commitments: DialCommitmentNotch[];
  marks: DialMark[];
  /** The provenance of the number under it. */
  epistemicTag: EpistemicTag;
  tone: MascotTone;
  onChangeTone: (tone: MascotTone) => void;
  skippedToday: boolean;
  onRepairSkip: () => void;
  isShiftPostNightWarning?: boolean;
}

const SIZE = 240;
const HEIGHT = 264;
/** A little room below the ring for the noon label, so the clock reads
 *  midnight-at-top without the labels sitting on the ticks. */
const CENTER = SIZE / 2;
const CENTER_Y = 130;
const R_PLANNED = 92;
const R_TARGET = 78;
const R_GHOST = 64;
const R_BODY = 100;
const R_BAND = 108;
const R_NOTCH = 116;

/** Minutes since midnight → degrees, with midnight at the top. */
function minToAngleDeg(min: number): number {
  return (wrapClockMin(min) / 1440) * 360 - 90;
}

/**
 * Polar → cartesian, rounded to two decimals.
 *
 * The rounding is not cosmetic: an SVG attribute is serialised as a string,
 * and the server and the browser disagree about the last bit of a cosine.
 * Without it the markup differs between the two renders and React calls it a
 * hydration mismatch.
 */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: Math.round((cx + r * Math.cos(rad)) * 100) / 100,
    y: Math.round((cy + r * Math.sin(rad)) * 100) / 100,
  };
}

/** An arc from startMin to endMin, clockwise, wrapping midnight cleanly. */
function arcPath(r: number, startMin: number, endMin: number): string {
  const s = wrapClockMin(startMin);
  const dur = wrapClockMin(wrapClockMin(endMin) - s);
  if (dur <= 0) return "";
  const startAngle = minToAngleDeg(s);
  const endAngle = startAngle + (dur / 1440) * 360;
  const a = polar(CENTER, CENTER_Y, r, startAngle);
  const b = polar(CENTER, CENTER_Y, r, endAngle);
  const large = dur > 720 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

/** A filled band between two radii, for the body clock's uncertainty. */
function bandPath(rOuter: number, rInner: number, startMin: number, endMin: number): string {
  const s = wrapClockMin(startMin);
  const dur = wrapClockMin(wrapClockMin(endMin) - s);
  if (dur <= 0) return "";
  const startAngle = minToAngleDeg(s);
  const endAngle = startAngle + (dur / 1440) * 360;
  const o1 = polar(CENTER, CENTER_Y, rOuter, startAngle);
  const o2 = polar(CENTER, CENTER_Y, rOuter, endAngle);
  const i1 = polar(CENTER, CENTER_Y, rInner, endAngle);
  const i2 = polar(CENTER, CENTER_Y, rInner, startAngle);
  const large = dur > 720 ? 1 : 0;
  return [
    `M ${o1.x} ${o1.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${i2.x} ${i2.y}`,
    "Z",
  ].join(" ");
}

export function CircadianDial(props: CircadianDialProps) {
  const {
    dayLabel,
    mode,
    plannedSleep,
    targetNight,
    usualSleep,
    estimatedBody,
    uncertaintyHalfWidthMin,
    misalignmentHours,
    misalignmentLowHours,
    misalignmentHighHours,
    baselineMisalignmentHours,
    metricLabel = "off target",
    commitments,
    marks,
    epistemicTag,
    tone,
    onChangeTone,
    skippedToday,
    onRepairSkip,
    isShiftPostNightWarning,
  } = props;

  const [asList, setAsList] = useState(false);
  const listId = useId();

  const bandStart = estimatedBody.startMin - uncertaintyHalfWidthMin;
  const bandEnd = estimatedBody.endMin + uncertaintyHalfWidthMin;
  const bandHours = `±${(uncertaintyHalfWidthMin / 60).toFixed(1)}h`;

  const description = [
    `24-hour dial for ${dayLabel}, ${mode === "TRIP" ? "travel" : "shift"} mode.`,
    `Planned sleep ${fmtMin(plannedSleep.startMin)} to ${fmtMin(plannedSleep.endMin)}.`,
    `Target night ${fmtMin(targetNight.startMin)} to ${fmtMin(targetNight.endMin)}.`,
    `Usual sleep ${fmtMin(usualSleep.startMin)} to ${fmtMin(usualSleep.endMin)}.`,
    `Estimated body clock ${fmtMin(estimatedBody.startMin)} to ${fmtMin(estimatedBody.endMin)}, uncertainty ${bandHours}.`,
    `Off target by ${misalignmentHours.toFixed(1)} hours, between ${misalignmentLowHours.toFixed(1)} and ${misalignmentHighHours.toFixed(1)}.`,
    `With no plan it would be ${baselineMisalignmentHours.toFixed(1)} hours.`,
  ].join(" ");

  const legend: { label: string; swatch: string; detail: string }[] = [
    {
      label: "Target night",
      swatch: "dial-swatch-target",
      detail: `${fmtMin(targetNight.startMin)}–${fmtMin(targetNight.endMin)}`,
    },
    {
      label: "Usual sleep",
      swatch: "dial-swatch-ghost",
      detail: `${fmtMin(usualSleep.startMin)}–${fmtMin(usualSleep.endMin)}`,
    },
    {
      label: "Planned sleep",
      swatch: "dial-swatch-sleep",
      detail: `${fmtMin(plannedSleep.startMin)}–${fmtMin(plannedSleep.endMin)}`,
    },
    {
      label: "Body clock (estimate)",
      swatch: "dial-swatch-body",
      detail: `${fmtMin(estimatedBody.startMin)}–${fmtMin(estimatedBody.endMin)} ${bandHours}`,
    },
  ];

  return (
    <section className="dial" aria-label={`Body clock for ${dayLabel}`}>
      <div className="dial-head">
        <h3 className="dial-title">
          {dayLabel} · {mode === "TRIP" ? "Travel" : "Shift"}
        </h3>
        <p className="dial-figure">
          {misalignmentHours.toFixed(1)}h {metricLabel}
          <span className="dial-sub">
            {" "}
            ({misalignmentLowHours.toFixed(1)}–{misalignmentHighHours.toFixed(1)}h, {epistemicTag.toLowerCase()})
          </span>
        </p>
      </div>

      <div className="dial-body">
        <div>
          <svg
            className="dial-svg"
            viewBox={`0 0 ${SIZE} ${HEIGHT}`}
            role="img"
            aria-label={description}
            aria-describedby={asList ? listId : undefined}
          >
            {/* the ring and its hours */}
            <circle className="dial-ring" cx={CENTER} cy={CENTER_Y} r={R_NOTCH} />
            {Array.from({ length: 24 }, (_, h) => {
              const major = h % 6 === 0;
              const a = polar(CENTER, CENTER_Y, R_NOTCH, minToAngleDeg(h * 60));
              const b = polar(CENTER, CENTER_Y, R_NOTCH - (major ? 10 : 5), minToAngleDeg(h * 60));
              return (
                <line
                  key={`tick-${h}`}
                  className={major ? "dial-tick-major" : "dial-tick"}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
              );
            })}
            <text className="dial-label" x={CENTER} y={12} textAnchor="middle">
              midnight
            </text>
            <text className="dial-label" x={CENTER} y={HEIGHT - 6} textAnchor="middle">
              noon
            </text>

            {/* the body clock's band, then the estimate inside it */}
            <path
              className="dial-band"
              d={bandPath(R_BAND, R_BODY, bandStart, bandEnd)}
            />
            <path
              className="dial-body-arc"
              d={arcPath(R_BODY, estimatedBody.startMin, estimatedBody.endMin)}
            />

            {/* the ghost arc, the target, the plan */}
            <path
              className="dial-arc-ghost"
              d={arcPath(R_GHOST, usualSleep.startMin, usualSleep.endMin)}
            />
            <path
              className="dial-arc-target"
              d={arcPath(R_TARGET, targetNight.startMin, targetNight.endMin)}
            />
            <path
              className="dial-arc-sleep"
              d={arcPath(R_PLANNED, plannedSleep.startMin, plannedSleep.endMin)}
            />

            {/* commitments on the perimeter */}
            {commitments.map((c) => {
              const a = polar(CENTER, CENTER_Y, R_NOTCH + 4, minToAngleDeg(c.startMin));
              const b = polar(CENTER, CENTER_Y, R_NOTCH + 4, minToAngleDeg(c.endMin));
              const mid = polar(
                CENTER,
                CENTER,
                R_NOTCH + 4,
                minToAngleDeg(c.startMin + wrapClockMin(c.endMin - c.startMin) / 2),
              );
              return (
                <g key={c.id}>
                  <line
                    className={c.fixed ? "dial-notch-committed" : "dial-notch-movable"}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                  />
                  <circle className="dial-mark" cx={mid.x} cy={mid.y} r={2.5} />
                </g>
              );
            })}

            {/* the secondary nudges */}
            {marks.map((m) => {
              const p = polar(CENTER, CENTER_Y, R_PLANNED + 12, minToAngleDeg(m.startMin));
              return (
                <circle
                  key={m.id}
                  className={m.isPrimary ? "dial-mark-primary" : "dial-mark"}
                  cx={p.x}
                  cy={p.y}
                  r={m.isPrimary ? 4 : 2.5}
                />
              );
            })}
          </svg>
        </div>

        <div className="dial-center">
          <SolLunaMascot
            state={skippedToday ? "droop" : "syncing"}
            tone={tone}
            misalignmentHours={misalignmentHours}
            baselineMisalignmentHours={baselineMisalignmentHours}
            skippedToday={skippedToday}
            isShiftPostNightWarning={isShiftPostNightWarning}
          />
          {skippedToday && (
            <div className="dial-actions">
              <button type="button" className="dial-btn" onClick={onRepairSkip}>
                Repair today
              </button>
            </div>
          )}
          <ul className="dial-legend">
            {legend.map((l) => (
              <li className="dial-legend-row" key={l.label}>
                <span className={`dial-swatch ${l.swatch}`} aria-hidden="true" />
                <span>{l.label}</span>
                <span className="dial-sub">{l.detail}</span>
              </li>
            ))}
          </ul>
          <div className="dial-actions">
            <button
              type="button"
              className="dial-btn"
              aria-pressed={asList}
              onClick={() => setAsList((v) => !v)}
              aria-controls={listId}
            >
              {asList ? "Show the dial" : "As a list"}
            </button>
            {(["gentle", "cheeky", "direct"] as const).map((t) => (
              <button
                key={t}
                type="button"
                className="dial-btn"
                aria-pressed={tone === t}
                onClick={() => onChangeTone(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {asList && (
        <ul className="dial-list" id={listId}>
          {legend.map((l) => (
            <li className="dial-list-row" key={l.label}>
              <span>{l.label}</span>
              <span>{l.detail}</span>
            </li>
          ))}
          <li className="dial-list-row">
            <span>{metricLabel === "off target" ? "Off target" : metricLabel}</span>
            <span>
              {misalignmentHours.toFixed(1)}h ({misalignmentLowHours.toFixed(1)}–
              {misalignmentHighHours.toFixed(1)}h)
            </span>
          </li>
          <li className="dial-list-row">
            <span>With no plan</span>
            <span>{baselineMisalignmentHours.toFixed(1)}h</span>
          </li>
          {commitments.map((c) => (
            <li className="dial-list-row" key={c.id}>
              <span>
                {c.title} ({c.fixed ? "fixed" : "movable"})
              </span>
              <span>
                {fmtMin(c.startMin)}–{fmtMin(c.endMin)}
              </span>
            </li>
          ))}
          {marks.map((m) => (
            <li className="dial-list-row" key={m.id}>
              <span>{m.label}</span>
              <span>{fmtMin(m.startMin)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The grade for a nudge kind, for a card that wants the one-liner. */
export function gradeLineFor(kind: InterventionKind | "hydration"): string {
  const e = getEvidenceForKind(kind);
  return `${e.channelLabel} · mechanism ${e.mechanismGrade.toLowerCase()}, field evidence ${e.fieldGrade.toLowerCase()}`;
}
