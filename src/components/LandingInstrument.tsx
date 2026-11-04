"use client";

import { sunSelfRead, sunSelfSleeping } from "@/domain/sun-self";
import type { RouteGapRead } from "@/domain/route-gap";
import { GlassSun } from "./GlassSun";

/* Phase 2 — the landing's glass instrument: the traveller's meridian as a
 * refractive medallion. Blank draft = the sleeping read (never demo
 * data); resolved draft = the full gap, zero progress — the instrument is
 * the destination, not a progress bar. The caption carries the read's
 * honest line in visible copy, not only for AT. */

export function LandingInstrument({
  visitor,
}: {
  visitor?: { gap: RouteGapRead; covPct: number | null } | null;
}) {
  const read = visitor?.gap
    ? sunSelfRead({
        owedMin: Math.abs(visitor.gap.gapMin),
        deliveredMin: 0,
        requiredMin: Math.abs(visitor.gap.gapMin),
        direction: visitor.gap.direction,
        daysLocked: 0,
      })
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
