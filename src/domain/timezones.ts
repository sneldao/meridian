// Real time zones. Offsets come from the IANA database via Intl, evaluated on
// the actual trip dates, so DST is right (London is UTC+1 until 25 Oct 2026).

/** UTC offset in minutes of `tz` at instant `at` (e.g. Europe/London in Oct → 60). */
export function utcOffsetMinAt(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value);
  const wallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  const atMinute = Math.floor(at.getTime() / 60000) * 60000;
  return Math.round((wallAsUtc - atMinute) / 60000);
}

/** Offset at local noon of an ISO date (avoids landing inside a DST gap). */
export function utcOffsetMinOn(tz: string, isoDate: string): number {
  return utcOffsetMinAt(tz, new Date(`${isoDate}T12:00:00Z`));
}

/**
 * Wrap a raw phase shift into (−720, +720] minutes. Negative = advance (east),
 * positive = delay (west). Exactly 12 h resolves to a delay: delays are the
 * easier direction for the human clock.
 */
export function wrapShiftMin(min: number): number {
  const m = ((min % 1440) + 1440) % 1440;
  return m > 720 ? m - 1440 : m;
}

/** "UTC+1", "UTC−5:30". */
export function fmtUtcOffset(min: number): string {
  const sign = min >= 0 ? "+" : "−";
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
}

/** "09:14" — the wall clock in `tz` at the instant `at`.
 *
 *  Formatting through Intl (rather than offset arithmetic + a formatter) so
 *  the hour that prints is the hour a person in that city sees, including the
 *  half-hours and the DST edge days. This is what the globe hover uses, so a
 *  tourist-tapped city never shows a time its own clocks disagree with. */
export function localClock(tz: string, at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}
