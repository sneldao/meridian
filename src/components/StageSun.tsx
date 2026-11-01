"use client";

import { useEffect, useRef } from "react";
import { SunSelf } from "@/components/SunSelf";
import { STAGE_SUN_VARS, stageSunVars, type StageSunRead } from "@/domain/stage-sun";
import type { SunSelfRead } from "@/domain/sun-self";

/* The hero sun (round 27). One large disc for a stage, positioned by the
 * solar model and carrying the traveller's own meridian inside it — the
 * round-23 phase C idea grown up: the stage sky's sun is the face.
 *
 * Rendering rules it inherits:
 *  · zero inline styles and zero hex — the position rides CSS custom
 *    properties written imperatively (HeroDawnPanel's pattern), the colours
 *    live in globals.css under the stage-sun classes;
 *  · the face inside is SunSelf, so every lid, ray and glow is computed,
 *    never authored;
 *  · the written read of the sun lives beside the stage (Rule 2): this
 *    component is the enhancement, and it says so in its aria label. */

export interface StageSunProps {
  /** Where the disc stands, from stageSunFor. */
  sun: StageSunRead;
  /** The face the disc carries — computed by the caller, never here. */
  read: SunSelfRead;
  /** Replays the pulse when the key changes (a locked day lights the face). */
  pulseKey?: string | number | null;
  /** The written read, for the aria label — never the disc's alone. */
  label: string;
}

export function StageSun({ sun, read, pulseKey = null, label }: StageSunProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const vars = stageSunVars(sun);
    for (const name of STAGE_SUN_VARS) el.style.setProperty(name, vars[name]);
    return () => {
      for (const name of STAGE_SUN_VARS) el.style.removeProperty(name);
    };
  }, [sun]);

  return (
    <div className={`stage-sun${sun.belowHorizon ? " below" : ""}`} ref={ref} role="img" aria-label={label}>
      <div className="stage-sun-smear" aria-hidden="true" />
      <div className="stage-sun-halo" aria-hidden="true" />
      <div className="stage-sun-disc">
        <SunSelf read={read} tone="ink" pulseKey={pulseKey} className="stage-sun-face" />
      </div>
    </div>
  );
}
