// The traveller's own marks, read back for the projection.
//
// The dial shows where the body clock will be. That answer is only true if it
// knows what the traveller actually did — and until now it did not: a person
// who missed the 07:00 light on D-2 still saw a dial crediting them with it,
// because the projection ran the *plan* and ignored the marks.
//
// The marks live in the browser (`meridian:checkins`), one per step, and they
// are the traveller's own record. This module is the one place that turns
// them into something the model can use: the days whose clock-moving cue was
// missed, which the projection then treats as days that did not happen.
//
// A skip only counts when it was a *clock-moving* cue: missing the caffeine
// cutoff changes nothing about the body clock, so it must not move the
// projection.

import type { CheckIn } from "./types";

/** The cues that move the clock. A skip of anything else is not the
 *  projection's business. */
const CLOCK_MOVERS = new Set(["light_exposure", "avoid_light"]);

/**
 * The day indices whose clock-moving cue the traveller said they missed.
 *
 * Only "skipped" counts. A step marked done, or one marked partial, still
 * happened enough to move the clock the way the plan assumed; a step the
 * traveller explicitly did not do did not.
 */
export function skippedClockDays(checkIns: CheckIn[]): Set<number> {
  const out = new Set<number>();
  for (const c of checkIns) {
    if (c.status !== "skipped") continue;
    // A free-text check-in about the whole day has no kind; we cannot tell
    // what it skipped, so it does not count.
    if (!c.kind || !CLOCK_MOVERS.has(c.kind)) continue;
    out.add(c.dayIndex);
  }
  return out;
}

/** Reads the persisted marks, tolerating absent or corrupt storage. */
export function readCheckIns(raw: string | null): CheckIn[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is CheckIn =>
        !!c && typeof c.dayIndex === "number" && typeof c.status === "string",
    );
  } catch {
    return [];
  }
}
