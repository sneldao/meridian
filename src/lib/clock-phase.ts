/**
 * Ambient motion that means something tells time.
 *
 * A 60s loop started at mount is a free-running oscillator: its position means
 * nothing. Give it the negative delay below and the loop's own zero lands on
 * the real second, so the element's position is a reading of the current
 * minute. One style write on mount (and on the tab becoming visible again) —
 * the compositor keeps the tempo from then on, so there is no tick to run.
 */

/** Seconds into the current minute, sub-second precision included. */
export function minutePhaseSec(date = new Date()): number {
  return date.getSeconds() + date.getMilliseconds() / 1000;
}

/** The `animation-delay` that puts a 60s loop in phase with `date`. */
export function clockPhaseDelay(date = new Date()): string {
  return `${-minutePhaseSec(date)}s`;
}
