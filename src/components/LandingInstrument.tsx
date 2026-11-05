"use client";

import { sunSelfRead, sunSelfSleeping, sunSelfVisitor } from "@/domain/sun-self";
import type { RouteGapRead } from "@/domain/route-gap";
import { useLiveDate } from "@/lib/use-live-date";
import { GlassSun } from "./GlassSun";

/* Phase 2 — the landing's glass instrument: the traveller's meridian as a
 * refractive medallion. Blank draft = the visitor read — the face lit for
 * the person standing here, off the device clock (never demo data);
 * resolved draft = the full gap, zero progress — the instrument is the
 * destination, not a progress bar. The caption carries the read's honest
 * line in visible copy, not only for AT. */

/* "Europe/London" → "London" — the visitor's own zone named the way a
 * person names where they are. Client-only: the server's zone is not the
 * visitor's, so callers gate this on the mounted live date. */
function visitorCityLabel(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    return (tz.split("/").pop() ?? tz).replace(/_/g, " ").trim();
  } catch {
    return "";
  }
}

/** "09:12" — 24-hour like every clock the app prints (fmtMin family). */
function visitorTimeLabel(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function LandingInstrument({
  visitor,
}: {
  visitor?: { gap: RouteGapRead; covPct: number | null } | null;
}) {
  /* The live date is honest about hydration — null until mounted, so the
   * server/first paint keeps the sleeping read and the face wakes on the
   * same tick every other surface uses. Once a minute is a DOM text tick,
   * not canvas work. */
  const liveDate = useLiveDate();
  const read = visitor?.gap
    ? sunSelfRead({
        owedMin: Math.abs(visitor.gap.gapMin),
        deliveredMin: 0,
        requiredMin: Math.abs(visitor.gap.gapMin),
        direction: visitor.gap.direction,
        daysLocked: 0,
      })
    : liveDate
      ? sunSelfVisitor(visitorCityLabel(), visitorTimeLabel(liveDate))
      : sunSelfSleeping();

  return (
    <figure className="landing-instrument" aria-labelledby="li-caption">
      <GlassSun
        read={read}
        size={300}
        tone="ink"
        pulseKey={visitor?.gap ? `${visitor.gap.destName}:${visitor.gap.gapMin}` : null}
        follow
        speak
        wake
      />
      <figcaption className="landing-instrument-cap" id="li-caption">
        <span className="li-label">Your body clock</span>
        <span className="li-line">{read.line}</span>
        <span className="li-hint">Press to catch the light</span>
      </figcaption>
      <span className="landing-instrument-base" aria-hidden="true" />
    </figure>
  );
}
