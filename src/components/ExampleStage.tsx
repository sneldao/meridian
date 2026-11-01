"use client";

import { useEffect, useId, useRef } from "react";
import { StageSun } from "@/components/StageSun";
import { fmtMin } from "@/domain/circadian";
import type { DaySceneModel } from "@/domain/day-scene";
import { inspectDayScene } from "@/domain/day-scene";
import { stageSky, stageSkyVars, STAGE_SKY_VARS } from "@/domain/stage-sky";
import { STAGE_SUN_VARS, stageSunVars, type StageSunRead } from "@/domain/stage-sun";
import type { SunSelfRead } from "@/domain/sun-self";

/* The example as one stage (round 27). The three-step pick→scrub→plan flow
 * extended the page and made it verbose; the stage replaces it: the scrubbed
 * sky IS the backdrop, the hero sun rides the day's modeled arc with the
 * traveller's face inside it, and the clocks, windows and plan answer in
 * place as time moves. Nothing grows; everything transforms.
 *
 * The backdrop is the standard ink-stage background (shared with .hero and
 * .today-stage), driven by stageSky's luminance-clamped horizon — paper text
 * stays readable at every altitude. The sun's position rides CSS variables
 * written imperatively (the HeroDawnPanel pattern), so this file keeps zero
 * inline styles; server and client agree on the ink default. */

export interface ExampleStageProps {
  scene: DaySceneModel;
  /** Controlled scrubbed minute; the stage never owns it. */
  minute: number;
  onMinuteChange: (minute: number) => void;
  /** The disc's position, from stageSunFor — computed by the caller. */
  sun: StageSunRead;
  /** The face inside the disc — computed, never authored. */
  face: SunSelfRead;
  pulseKey?: string | number | null;
}

export function ExampleStage({ scene, minute, onMinuteChange, sun, face, pulseKey }: ExampleStageProps) {
  const uid = useId();
  const stageRef = useRef<HTMLElement>(null);
  const smearRef = useRef<{ minute: number; at: number } | null>(null);

  const read = inspectDayScene(scene, minute);

  // The stage's sky follows the scrubber: stageSky clamps the horizon band so
  // the paper readout survives a midday sun. Zero debt on the example — the
  // owed wash is the origin-blue residue, and here there is nothing owed.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const alt = read.solar?.altitude ?? -12;
    const vars = stageSkyVars(stageSky(alt, 0, 1)) as Record<string, string>;
    for (const name of STAGE_SKY_VARS) el.style.setProperty(name, vars[name]);
    const sunVars = stageSunVars(sun);
    for (const name of STAGE_SUN_VARS) el.style.setProperty(name, sunVars[name]);
    return () => {
      for (const name of [...STAGE_SKY_VARS, ...STAGE_SUN_VARS]) el.style.removeProperty(name);
    };
  }, [read.solar?.altitude, sun]);

  // The smear (the showreel's one borrowed idea): a fast scrub stretches the
  // halo along the travel axis, then it relaxes. Transform-only; the value
  // rides a variable the CSS decays with a transition.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const prev = smearRef.current;
    const at = Date.now();
    let smear = 0;
    if (prev && at > prev.at) {
      const perSecond = Math.abs(minute - prev.minute) / ((at - prev.at) / 1000);
      smear = Math.min(1, Math.max(0, (perSecond - 40) / 240));
    }
    smearRef.current = { minute, at };
    el.style.setProperty("--stage-sun-smear", smear.toFixed(3));
  }, [minute]);

  const setMinute = (m: number) => onMinuteChange(Math.max(0, Math.min(1439, Math.round(m))));
  const windows = read.activeWindows;

  return (
    <section className="example-stage" ref={stageRef} aria-label={`The day over ${scene.city.name}`}>
      <StageSun
        sun={sun}
        read={face}
        pulseKey={pulseKey}
        label={`${fmtMin(read.localMin)} ${scene.city.name}: ${sun.bandLabel ?? "sun position unavailable"}`}
      />

      <div className="example-stage-read">
        <p className="example-stage-clocks">
          <b className="font-mono2">{fmtMin(read.localMin)}</b> {scene.city.name}
          <span className="example-stage-sep" aria-hidden="true">·</span>
          <b className="font-mono2">{fmtMin(read.bodyMin)}</b> body time
        </p>
        <p className="example-stage-sun-line">
          {sun.bandLabel ?? "The model cannot place the sun here"}
          {sun.belowHorizon && " — held at the horizon until it rises"}
        </p>
        <p className="example-stage-window" aria-live="polite">
          {windows.length
            ? windows.map((w) => `${w.label} · until ${w.endMin >= 1440 ? "24:00" : fmtMin(w.endMin)}`).join(" — ")
            : "No light or sleep window at this moment."}
        </p>
      </div>

      <div className="example-stage-scrub">
        <label htmlFor={`${uid}-scrub`} className="example-stage-scrub-label">
          Drag the day
        </label>
        <input
          id={`${uid}-scrub`}
          type="range"
          min={0}
          max={1439}
          step={1}
          value={read.localMin}
          aria-valuetext={`${fmtMin(read.localMin)} ${scene.city.name} local; ${fmtMin(read.bodyMin)} estimated body time`}
          onChange={(e) => setMinute(Number(e.target.value))}
        />
        <div className="example-stage-stepper" role="group" aria-label="Step through the day">
          <button type="button" aria-label="Back 15 minutes" onClick={() => setMinute(read.localMin - 15)}>−15m</button>
          <button type="button" aria-label="Forward 15 minutes" onClick={() => setMinute(read.localMin + 15)}>+15m</button>
          {scene.windows.map((w) => (
            <button
              key={w.id}
              type="button"
              data-active={read.localMin >= w.startMin && read.localMin < w.endMin}
              onClick={() => setMinute(w.startMin)}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <p className="example-stage-honesty">
        Modeled sky and sun — not a weather forecast. Inspection only; nothing is saved.
      </p>
    </section>
  );
}
