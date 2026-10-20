"use client";

// The sleep dial — a dial you answer with.
//
// The setup asks one question: when does your body usually expect to sleep?
// The obvious answer is two sliders, and the obvious *better* answer is the
// dial the app already has: you move the arc to your night. It is the same
// picture the rest of the product uses, so the traveller learns it once.
//
// Two handles, bed and wake. Drag either, or tap the ring and the nearer
// handle follows. Both handles are focusable sliders, so the whole thing
// works from the keyboard — an answer you can only give with a mouse is an
// answer some people cannot give.

import { useCallback, useEffect, useRef, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import { bandForWakeTime, getSleepInsight, type SleepBand } from "@/domain/mascot";

export interface SleepDialProps {
  bedtimeMin: number;
  wakeMin: number;
  onChange: (next: { bedtimeMin: number; wakeMin: number }) => void;
  /** The travel direction, so the mascot can say whether this helps. */
  direction?: "east" | "west" | null;
  /** The band the traveller's wake answer implies, for the mascot's line. */
  band?: SleepBand | null;
}

const SIZE = 260;
const CENTER = SIZE / 2;
const R_ARC = 92;
const R_TICK = 108;
const R_HANDLE = 118;
/** The shortest and longest sleep the dial will draw. */
const MIN_SLEEP_MIN = 240;
const MAX_SLEEP_MIN = 720;

const wrap = (m: number) => ((m % 1440) + 1440) % 1440;
const minToAngleDeg = (min: number) => (wrap(min) / 1440) * 360 - 90;

function polar(r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + r * Math.cos(rad), y: CENTER + r * Math.sin(rad) };
}

function arcPath(r: number, startMin: number, endMin: number): string {
  const s = wrap(startMin);
  const dur = wrap(wrap(endMin) - s) || 1440;
  const startAngle = minToAngleDeg(s);
  const endAngle = startAngle + (dur / 1440) * 360;
  const a = polar(r, startAngle);
  const b = polar(r, endAngle);
  const large = dur > 720 ? 1 : 0;
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

/** The angle (clockwise from midnight) a pointer position falls on. */
function angleFromPoint(x: number, y: number): number {
  const deg = (Math.atan2(y - CENTER, x - CENTER) * 180) / Math.PI + 90;
  return wrap(deg);
}

export function SleepDial({
  bedtimeMin,
  wakeMin,
  onChange,
  direction,
  band,
}: SleepDialProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragging, setDragging] = useState<"bed" | "wake" | null>(null);
  const [focused, setFocused] = useState<"bed" | "wake">("bed");

  const sleepMin = wrap(wakeMin - bedtimeMin) || 1440;

  const move = useCallback(
    (handle: "bed" | "wake", toMin: number) => {
      if (handle === "bed") {
        const next = wrap(toMin);
        // The night cannot invert or stretch past the limits.
        const delta = wrap(wakeMin - next);
        if (delta < MIN_SLEEP_MIN || delta > MAX_SLEEP_MIN) return;
        onChange({ bedtimeMin: next, wakeMin });
      } else {
        const next = wrap(toMin);
        const delta = wrap(next - bedtimeMin);
        if (delta < MIN_SLEEP_MIN || delta > MAX_SLEEP_MIN) return;
        onChange({ bedtimeMin, wakeMin: next });
      }
    },
    [bedtimeMin, wakeMin, onChange],
  );

  /** Which handle the pointer is nearer — the one that follows the finger. */
  const nearestHandle = useCallback(
    (toMin: number): "bed" | "wake" => {
      const dBed = Math.abs(wrap(toMin - bedtimeMin + 720) - 720);
      const dWake = Math.abs(wrap(toMin - wakeMin + 720) - 720);
      return dBed <= dWake ? "bed" : "wake";
    },
    [bedtimeMin, wakeMin],
  );

  const pointToMinutes = useCallback((clientX: number, clientY: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = ((clientX - rect.left) / rect.width) * SIZE;
    const y = ((clientY - rect.top) / rect.height) * SIZE;
    const deg = angleFromPoint(x, y);
    return Math.round((wrap(deg + 90) / 360) * 1440);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => move(dragging, pointToMinutes(e.clientX, e.clientY));
    const onUp = () => setDragging(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, move, pointToMinutes]);

  const handleKey = (handle: "bed" | "wake") => (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 60 : 15;
    const current = handle === "bed" ? bedtimeMin : wakeMin;
    let next = current;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = current + step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = current - step;
    else return;
    e.preventDefault();
    move(handle, next);
  };

  const bedPoint = polar(R_HANDLE, minToAngleDeg(bedtimeMin));
  const wakePoint = polar(R_HANDLE, minToAngleDeg(wakeMin));
  // The answer to "when do you sleep" is the wake time, so the band comes
  // from the dial itself rather than from a separate question.
  const answerBand = bandForWakeTime(wakeMin);
  const insight = getSleepInsight({
    band: answerBand ?? band,
    direction,
    sleepHours: sleepMin / 60,
  });

  return (
    <div className="sleep-dial">
      <svg
        ref={svgRef}
        className="sleep-dial-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="group"
        aria-label="Your usual sleep window. Move the bed and wake handles to set when you usually sleep."
        onPointerDown={(e) => {
          const min = pointToMinutes(e.clientX, e.clientY);
          const handle = nearestHandle(min);
          setDragging(handle);
          setFocused(handle);
          move(handle, min);
        }}
      >
        <circle className="sleep-dial-ring" cx={CENTER} cy={CENTER} r={R_TICK} />
        {Array.from({ length: 24 }, (_, h) => {
          const major = h % 6 === 0;
          const a = polar(R_TICK, minToAngleDeg(h * 60));
          const b = polar(R_TICK - (major ? 9 : 5), minToAngleDeg(h * 60));
          return (
            <line
              key={h}
              className={major ? "sleep-dial-tick-major" : "sleep-dial-tick"}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
            />
          );
        })}
        <text className="sleep-dial-label" x={CENTER} y={CENTER - 68} textAnchor="middle">
          midnight
        </text>
        <text className="sleep-dial-label" x={CENTER} y={CENTER + 74} textAnchor="middle">
          noon
        </text>

        <path className="sleep-dial-arc" d={arcPath(R_ARC, bedtimeMin, wakeMin)} />

        <circle
          className={`sleep-dial-handle${focused === "bed" ? " is-focused" : ""}`}
          cx={bedPoint.x}
          cy={bedPoint.y}
          r={7}
          tabIndex={0}
          role="slider"
          aria-label="Usual bedtime"
          aria-valuemin={0}
          aria-valuemax={1439}
          aria-valuenow={bedtimeMin}
          aria-valuetext={fmtMin(bedtimeMin)}
          onFocus={() => setFocused("bed")}
          onKeyDown={handleKey("bed")}
        />
        <circle
          className={`sleep-dial-handle${focused === "wake" ? " is-focused" : ""}`}
          cx={wakePoint.x}
          cy={wakePoint.y}
          r={7}
          tabIndex={0}
          role="slider"
          aria-label="Usual wake time"
          aria-valuemin={0}
          aria-valuemax={1439}
          aria-valuenow={wakeMin}
          aria-valuetext={fmtMin(wakeMin)}
          onFocus={() => setFocused("wake")}
          onKeyDown={handleKey("wake")}
        />
      </svg>

      <p className="sleep-dial-readout">
        <strong>
          {fmtMin(bedtimeMin)} – {fmtMin(wakeMin)}
        </strong>{" "}
        <span className="dial-sub">
          {Math.floor(sleepMin / 60)}h{sleepMin % 60 ? ` ${sleepMin % 60}m` : ""} of sleep · drag
          the handles
        </span>
      </p>
      {insight && <p className="sleep-dial-insight">{insight}</p>}
    </div>
  );
}
