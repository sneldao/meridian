"use client";

import { geoInterpolate } from "d3-geo";
import { solarZenithDeg, subsolarPoint } from "@/domain/sun";
import type { Trip } from "@/domain/types";

/* The route as a line on the stage's horizon — the great-circle the WorldLens
 *  draws (geoInterpolate, so this strip can never disagree with the globe),
 *  flattened onto the band the sun sits on. Endpoint dots are home and
 *  destination; the tick is where the real route crosses today's terminator
 *  (solarZenithDeg sign flip — the same daylight test the shader uses);
 *  the ember marker is the traveller's body clock riding its own dawn —
 *  coverage along the arc, delivered / required, the same read the sun
 *  face and the chip already carry in words. */

export function StageArc({
  trip,
  coverage,
  date,
}: {
  trip: Trip;
  /** 0..1 — how far the body clock has travelled its required shift. */
  coverage: number;
  date: Date;
}) {
  const interp = geoInterpolate(
    [trip.origin.lon, trip.origin.lat],
    [trip.destination.lon, trip.destination.lat],
  );
  const sub = subsolarPoint(date);
  const N = 64;
  let prevDay = solarZenithDeg(trip.origin.lat, trip.origin.lon, sub) < 90;
  let crossing: { t: number; direction: string } | null = null;
  for (let i = 1; i <= N && !crossing; i++) {
    const [lon, lat] = interp(i / N);
    const day = solarZenithDeg(lat, lon, sub) < 90;
    if (day !== prevDay) crossing = { t: i / N, direction: prevDay ? "dusk" : "dawn" };
    prevDay = day;
  }

  const t = Math.min(1, Math.max(0, coverage));
  // The strip's drawable span: 4 → 96 of the 100-wide viewBox.
  const x = (f: number) => 4 + f * 92;
  const y = (f: number) => 18 - Math.sin(Math.PI * f) * 14; // the arc's own curve

  return (
    <svg
      className="stage-arc"
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        className="stage-arc-path"
        d={`M ${x(0)} ${y(0)} Q 50 ${18 - 28} ${x(1)} ${y(1)}`}
        fill="none"
      />
      <circle className="stage-arc-end" cx={x(0)} cy={y(0)} r="1.1" />
      <circle className="stage-arc-end" cx={x(1)} cy={y(1)} r="1.1" />
      {crossing && (
        <line
          className="stage-arc-term"
          x1={x(crossing.t)}
          y1={y(crossing.t) - 2.6}
          x2={x(crossing.t)}
          y2={y(crossing.t) + 2.6}
        />
      )}
      <circle className="stage-arc-sun" cx={x(t)} cy={y(t)} r="1.7" />
    </svg>
  );
}
