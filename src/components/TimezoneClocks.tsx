"use client";

import { useEffect, useState } from "react";
import { Solari } from "@/components/Solari";
import { fmtMin } from "@/domain/circadian";
import type { City } from "@/domain/types";

function clockAt(offsetMin: number, now: Date): string {
  return fmtMin(now.getUTCHours() * 60 + now.getUTCMinutes() + offsetMin);
}

export function TimezoneClocks({
  origin,
  destination,
  requiredShiftMin,
  bodyShiftMin,
}: {
  origin: City;
  destination: City;
  requiredShiftMin?: number;
  /** Minutes the locked days have actually moved the body clock so far
   *  (signed). When supplied, the bar carries the third time a disoriented
   *  traveller needs — where the body thinks it is — so one row replaces
   *  the two strips that used to say overlapping things. */
  bodyShiftMin?: number;
}) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const diffHours =
    requiredShiftMin !== undefined
      ? Math.abs(requiredShiftMin / 60)
      : Math.abs((destination.utcOffsetMin - origin.utcOffsetMin) / 60);

  const isAhead =
    requiredShiftMin !== undefined
      ? requiredShiftMin < 0
      : destination.utcOffsetMin > origin.utcOffsetMin;

  const diffDirection = isAhead ? "ahead" : "behind";

  return (
    <div className="tz-clocks-bar" role="region" aria-label="Home, destination and body-clock times">
      <div className="tz-clock-item">
        <span className="tz-clock-label">{origin.name} (Home)</span>
        <strong className="tz-clock-time"><Solari value={clockAt(origin.utcOffsetMin, now)} /></strong>
      </div>
      <div className="tz-clock-divider" aria-hidden="true">→</div>
      <div className="tz-clock-item">
        <span className="tz-clock-label">{destination.name}</span>
        <strong className="tz-clock-time"><Solari value={clockAt(destination.utcOffsetMin, now)} /></strong>
      </div>
      {bodyShiftMin !== undefined && (
        <div className="tz-clock-item tz-clock-body">
          <span className="tz-clock-label">Body (est.)</span>
          <strong className="tz-clock-time"><Solari value={`~${clockAt(origin.utcOffsetMin + bodyShiftMin, now)}`} /></strong>
        </div>
      )}
      <div className="tz-clock-diff">
        <span>{diffHours.toFixed(1)}h {diffDirection}</span>
      </div>
    </div>
  );
}
