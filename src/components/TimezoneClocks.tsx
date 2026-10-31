"use client";

import { useEffect, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import type { City } from "@/domain/types";

function clockAt(offsetMin: number, now: Date): string {
  return fmtMin(now.getUTCHours() * 60 + now.getUTCMinutes() + offsetMin);
}

export function TimezoneClocks({
  origin,
  destination,
  requiredShiftMin,
}: {
  origin: City;
  destination: City;
  requiredShiftMin?: number;
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
    <div className="tz-clocks-bar" role="region" aria-label="Current city times">
      <div className="tz-clock-item">
        <span className="tz-clock-label">{origin.name} (Home)</span>
        <strong className="tz-clock-time">{clockAt(origin.utcOffsetMin, now)}</strong>
      </div>
      <div className="tz-clock-divider" aria-hidden="true">→</div>
      <div className="tz-clock-item">
        <span className="tz-clock-label">{destination.name}</span>
        <strong className="tz-clock-time">{clockAt(destination.utcOffsetMin, now)}</strong>
      </div>
      <div className="tz-clock-diff">
        <span>{diffHours.toFixed(1)}h {diffDirection}</span>
      </div>
    </div>
  );
}
