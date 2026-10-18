"use client";

import { fmtMin } from "@/domain/circadian";

// Two sliders under the dawn globe. Both are native range inputs, which is
// deliberate: keyboard arrows, Home/End, screen-reader value announcements and
// touch dragging all come free, and the globe stays pure enhancement over a
// caption that already states the same read in words.
//
// Lane 1 is the clock — drag it and the terminator sweeps, both city clocks
// run. Lane 2 is the shift — drag it and the body's dawn slides onto the real
// one, which is the entire product thesis made tactile. Neither lane is
// destructive: both have a "back to now" reset.

export interface DawnScrubberProps {
  /** Minutes of day, 0–1440, in the origin's local time. */
  timeMin: number;
  onTimeChange: (min: number) => void;
  /** Minutes of shift the body still owes, 0–|requiredShiftMin|. */
  owedMin: number;
  /** The full shift, so the lane's right-hand end means "nothing banked". */
  requiredMin: number;
  onOwedChange: (min: number) => void;
  /** True once either lane has been moved off its live value. */
  overridden: boolean;
  onReset: () => void;
  /** Shown as the lane's caption, e.g. "London". */
  homeLabel: string;
  /** What the owed lane is closing toward, e.g. "Tokyo". */
  destLabel: string;
}

export function DawnScrubber({
  timeMin,
  onTimeChange,
  owedMin,
  requiredMin,
  onOwedChange,
  overridden,
  onReset,
  homeLabel,
  destLabel,
}: DawnScrubberProps) {
  // The lane stays mounted for the whole shift, including at zero. Hiding it
  // once the gap closes looks tidy but breaks the gesture: a native range drag
  // that reaches 0 would unmount the input it is dragging, and the drag dies
  // mid-flight. A closed lane reading 0h is honest, not dead.
  const shiftOpen = requiredMin > 0;

  return (
    <div className="scrub">
      <p className="scrub-label" style={{ textTransform: "none", letterSpacing: "0.02em" }}>
        Drag to explore — this doesn&apos;t change your plan.
      </p>
      <div className="scrub-lane">
        <label className="scrub-label" htmlFor="dawn-scrub-time">
          Time in {homeLabel}
        </label>
        <input
          id="dawn-scrub-time"
          className="scrub-range"
          type="range"
          min={0}
          max={1439}
          step={5}
          value={Math.round(timeMin) % 1440}
          onChange={(e) => onTimeChange(Number(e.target.value))}
          aria-label={`Time of day in ${homeLabel}`}
          aria-valuetext={fmtMin(timeMin)}
        />
        <output className="scrub-val" htmlFor="dawn-scrub-time">
          {fmtMin(timeMin)}
        </output>
      </div>

      {shiftOpen && (
        <div className="scrub-lane">
          <label className="scrub-label" htmlFor="dawn-scrub-shift">
            Body clock gap
          </label>
          <input
            id="dawn-scrub-shift"
            className="scrub-range shift"
            type="range"
            min={0}
            max={Math.round(requiredMin)}
            step={5}
            value={Math.round(owedMin)}
            onChange={(e) => onOwedChange(Number(e.target.value))}
            aria-label={`Hours your body clock is behind ${destLabel}`}
            aria-valuetext={`${(owedMin / 60).toFixed(1)} hours`}
          />
          <output className="scrub-val" htmlFor="dawn-scrub-shift">
            {(owedMin / 60).toFixed(1)}h
          </output>
        </div>
      )}

      {overridden && (
        <button type="button" className="scrub-reset" onClick={onReset}>
          Reset
        </button>
      )}
    </div>
  );
}