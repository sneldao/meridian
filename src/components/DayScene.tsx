"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { Pause, Play, RotateCcw } from "lucide-react";
import { fmtMin } from "@/domain/circadian";
import { inspectDayScene, type DaySceneModel } from "@/domain/day-scene";
import type { ResolvedPlaceChoice } from "@/lib/place-choices";
import { PerformanceBrief } from "@/components/PerformanceBrief";
import { LightWindowPanel } from "@/components/LightWindowPanel";

export interface DaySceneProps {
  scene: DaySceneModel;
  example?: boolean;
  exampleBaseline?: boolean;
  preview?: boolean;
  eventSource?: "google" | "fixture";
  idea?: ResolvedPlaceChoice;
  onSelectDay?: (label: string) => void;
  children?: ReactNode;
}

export function DayScene(props: DaySceneProps) {
  const { scene, example, exampleBaseline, preview, eventSource, idea, onSelectDay, children } = props;
  const uid = useId();
  const initial =
    scene.momentDayIndex === scene.dayIndex && scene.moment
      ? scene.moment.localMin
      : scene.windows.find((w) => w.kind === "seek")?.startMin ?? 720;
  const [minute, setMinute] = useState(initial);
  const [playing, setPlaying] = useState(false);
  const reduced = useReducedMotion();
  const read = useMemo(() => inspectDayScene(scene, minute), [scene, minute]);

  useEffect(() => {
    if (!playing || reduced) return;
    const t = setTimeout(() => {
      const next = Math.min(1439, minute + 10);
      setMinute(next);
      if (next >= 1439) setPlaying(false);
    }, 80);
    return () => clearTimeout(t);
  }, [playing, reduced, minute]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const x = (m: number) => 24 + (m / 1440) * 592;
  const y = (alt: number) => 124 - alt * 1.1;
  let dAttr = "";
  let pen = false;
  for (const p of scene.solarPoints) {
    if (p.altitude === null) { pen = false; continue; }
    dAttr += `${pen ? "L" : "M"}${x(p.minute).toFixed(1)} ${y(p.altitude).toFixed(1)} `;
    pen = true;
  }
  const kindOf = (k: string) => (k === "seek" ? "seek" : k === "reduce" ? "reduce" : "sleep");
  const eventHere = scene.moment && scene.momentDayIndex === scene.dayIndex ? scene.moment : null;
  const ideaShown =
    idea && (idea.status === "suggested" || idea.status === "kept") && idea.suggestion.date === scene.date ? idea : null;

  return (
    <section className="day-scene" aria-label="Explore your planned day">
      <PerformanceBrief
        compact
        moment={scene.moment}
        destination={scene.destination}
        date={scene.momentDate ?? undefined}
        example={example}
        exampleBaseline={exampleBaseline}
        preview={preview}
        eventSource={eventSource}
        hasPlan={!!scene.plan}
      />
      <div className="day-scene-inspector">
        <p className="entry-eyebrow">Explore {scene.dayLabel} · {scene.date} · {scene.city.name}</p>
        <div className="day-scene-clocks">
          <div>
            <strong>{fmtMin(read.localMin)}</strong>
            <span>{scene.city.name} local time</span>
          </div>
          <div>
            <strong>{fmtMin(read.bodyMin)}</strong>
            <span>Estimated body time</span>
          </div>
        </div>
        <div className="day-scene-sky" style={{ background: read.solar?.gradient ?? "var(--color-ink-3)" }}>
          <svg viewBox="0 0 640 260" role="img" aria-label={`${scene.city.name} modeled sun altitude on ${scene.date}`} aria-describedby={`${uid}-d`}>
            <title>{`${scene.city.name} modeled sun altitude on ${scene.date}`}</title>
            <desc id={`${uid}-d`}>modeled solar conditions; planned light guidance shown separately below</desc>
            <defs>
              <clipPath id={`${uid}-clip`}><rect x="0" y="0" width="640" height="260" rx="18" /></clipPath>
            </defs>
            <g clipPath={`url(#${uid}-clip)`}>
              <line x1="0" y1="124" x2="640" y2="124" stroke="#8fa0bf" strokeWidth="1" strokeDasharray="4 6" />
              <path d={dAttr} fill="none" stroke="#f5c86b" strokeWidth="2" />
              {[0, 360, 720, 1080, 1440].map((m, i) => (
                <text key={i} x={x(Math.min(m, 1439)) - 8} y={252}>
                  {["00", "06", "12", "18", "24"][i]}
                </text>
              ))}
              {read.solar && <circle cx={x(read.localMin)} cy={y(read.solar.altitude)} r="5" fill="#f5c86b" />}
              <line x1={x(read.localMin)} y1="8" x2={x(read.localMin)} y2="236" stroke="#e8eefc" strokeWidth="1.5" />
              {eventHere && (
                <line x1={x(eventHere.localMin)} y1="8" x2={x(eventHere.localMin)} y2="236" stroke="#f2e5c8" strokeWidth="1" strokeDasharray="3 5">
                  <title>{eventHere.title}</title>
                </line>
              )}
            </g>
          </svg>
        </div>
        <p className="day-scene-caption">
          Modeled sun position, not a weather forecast. {read.solar?.label ?? "Solar position unavailable at this local time; clock-change hours may be ambiguous."}
        </p>
        <label htmlFor={`${uid}-range`}>Inspect the day—not change the plan</label>
        <input
          id={`${uid}-range`}
          type="range"
          min={0}
          max={1439}
          step={1}
          value={read.localMin}
          aria-valuetext={`${fmtMin(read.localMin)} ${scene.city.name} local; ${fmtMin(read.bodyMin)} estimated body time`}
          onChange={(e) => { setPlaying(false); setMinute(Number(e.target.value)); }}
        />
        <div className="day-scene-controls">
          <button
            type="button"
            disabled={!!reduced}
            onClick={() => (playing ? setPlaying(false) : (setMinute(0), setPlaying(true)))}
            aria-pressed={playing}
          >
            {playing ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            {playing ? " Pause" : " Play"}
          </button>
          {reduced && <span className="day-scene-caption">Use the timeline with reduced motion.</span>}
          <button type="button" onClick={() => { setPlaying(false); setMinute(initial); }}>
            <RotateCcw size={14} aria-hidden="true" /> Reset
          </button>
          {eventHere && (
            <button type="button" onClick={() => { setPlaying(false); setMinute(eventHere.localMin); }}>
              Jump to {eventHere.title}
            </button>
          )}
          {scene.moment && scene.momentDayIndex !== scene.dayIndex && onSelectDay && (
            <button type="button" onClick={() => onSelectDay(scene.moment!.dayLabel)}>
              Jump to event day
            </button>
          )}
        </div>
        {(["seek", "reduce", "sleep"] as const).map((k) => {
          const lanes = scene.windows.filter((w) => w.kind === k);
          const name = k === "seek" ? "Seek light" : k === "reduce" ? "Reduce light" : "Sleep";
          return (
            <div key={k} className="day-scene-lane">
              <span>{name}</span>
              <div className="day-scene-track">
                {lanes.map((w) => (
                  <span
                    key={w.id}
                    className="day-scene-window"
                    data-kind={kindOf(w.kind)}
                    style={{ left: `${(w.startMin / 1440) * 100}%`, width: `${((w.endMin - w.startMin) / 1440) * 100}%` }}
                    title={`${w.label} ${fmtMin(w.startMin)}–${w.endMin === 1440 ? "24:00" : fmtMin(w.endMin)}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
        <div className="day-scene-jumps">
          {scene.windows.map((w) => (
            <button
              key={w.id}
              type="button"
              data-active={read.localMin >= w.startMin && read.localMin < w.endMin}
              onClick={() => { setPlaying(false); setMinute(w.startMin); }}
            >
              {w.label} {fmtMin(w.startMin)}–{w.endMin === 1440 ? "24:00" : fmtMin(w.endMin)}
              {w.fromEarlierDay && " · from earlier day"}
              {w.continuesAfter && " · continues tomorrow"}
            </button>
          ))}
        </div>
        <p className="day-scene-caption">
          {read.activeWindows.length
            ? read.activeWindows.map((w) => w.label).join(" · ")
            : "No listed light or sleep window at this time."}
        </p>
        {scene.hasUnplottedWindows && (
          <p className="day-scene-caption">Some windows cross a clock change — read the written plan below.</p>
        )}
        {!scene.plan && (
          <p className="day-scene-caption">
            This day has no verified plan yet. Earlier-day carry-over, if any, is shown separately.
          </p>
        )}
        {ideaShown && (
          <p className="day-scene-caption">
            <button
              type="button"
              onClick={() => { setPlaying(false); setMinute(ideaShown.suggestion.startMin); }}
            >
              {ideaShown.place.name} · {fmtMin(ideaShown.suggestion.startMin)}–{fmtMin(ideaShown.suggestion.endMin)}
            </button>{" "}
            Optional—not booked.
          </p>
        )}
        <details className="day-scene-details">
          <summary>See light, sleep and caffeine details</summary>
          <LightWindowPanel plan={scene.plan} date={scene.date} city={scene.city.name} preview={preview} example={example} />
        </details>
        <p className="day-scene-foot">
          Body-clock estimates, not measured alertness. Inspection and playback do not record completed steps.
        </p>
        {children}
      </div>
    </section>
  );
}
