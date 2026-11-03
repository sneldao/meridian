"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { fmtMin } from "@/domain/circadian";
import {
  crewScript,
  crewStateAt,
  type CrewPerformance as CrewPerformanceModel,
} from "@/domain/crew-performance";
import { CrewAvatar, type CrewAvatarState } from "@/components/CrewAvatar";

/* The crew performs in view (round 28).
 *
 *  The gate stamp is the agentic proof, and it used to be prose — four static
 *  lines, the differentiator hidden behind a menu. Now the crew's work plays:
 *  the agents speak one line each, then the solver's cues appear as a dashed
 *  draft on a 24-hour lane, and the day locks with the gate's real verdict
 *  stamped beside it. Every figure comes from crewPerformance() — the plans
 *  are solver output and the verdicts are evaluatePlan re-run incrementally —
 *  so the drama is honest: the pacing is authored, the numbers are not.
 *
 *  compact = the landing strip: plays once when scrolled into view.
 *  full    = the /demo beat: plays on mount, with skip and replay.
 *  Reduced motion renders the finished state outright — the result IS the
 *  written read (Rule 2), and nothing performs for a traveller who asked it
 *  not to. */

/** Step-category hues are the data-colour law (docs/DESIGN.md): one kind, one hue.
 *  Melatonin and naps belong to the sleep lane; cutoffs and meals to food. */
const KIND_TO_CAT: Record<string, string> = {
  light_exposure: "sunlight",
  avoid_light: "sunlight",
  sleep_window: "sleep",
  melatonin: "sleep",
  nap: "sleep",
  caffeine_cutoff: "nutrition",
  meal_timing: "nutrition",
  exercise: "run",
};

export interface CrewPerformanceProps {
  perf: CrewPerformanceModel;
  compact?: boolean;
  /** Beat pacing in ms — [agent line, day step]. Defaults to a measured
   *  read; the /demo beat plays it briskly. */
  beatMs?: [number, number];
}

export function CrewPerformance({ perf, compact = false, beatMs = [1100, 850] }: CrewPerformanceProps) {
  const reduced = useReducedMotion();
  const steps = useMemo(
    () => crewScript(perf.lines.length, perf.days.length),
    [perf],
  );
  const [pos, setPos] = useState(0);
  const [armed, setArmed] = useState(!compact);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Reduced motion stands the performance down and shows its result — the
  // finished state is derived, never set (no effect-driven cascade).
  const effectivePos = reduced ? steps.length - 1 : pos;

  // The landing strip plays once it is seen; the demo beat plays on mount.
  useEffect(() => {
    if (!compact || armed) return;
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setArmed(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [compact, armed]);

  // Autoplay advances one beat at a time once armed.
  useEffect(() => {
    if (reduced || !armed || effectivePos >= steps.length - 1) return;
    const t = setTimeout(
      () => setPos((p) => Math.min(steps.length - 1, p + 1)),
      effectivePos < perf.lines.length ? beatMs[0] : beatMs[1],
    );
    return () => clearTimeout(t);
  }, [effectivePos, steps.length, reduced, armed, perf.lines.length, beatMs]);

  const state = crewStateAt(steps, effectivePos);
  const done = effectivePos >= steps.length - 1;
  const bankedH = Math.round(perf.bankedMin / 6) / 10;

  // Avatar pose follows the script: the current speaker explains, the ones
  // already heard rest, and when the performance is over all are complete.
  const avatarState = (i: number): CrewAvatarState =>
    done ? "complete" : i === state.linesSpoken - 1 ? "explaining" : "resting";

  return (
    <div className={`crew-perf${compact ? " crew-perf-compact" : ""}`} ref={wrapRef}>
      <div className="crew-perf-lines" aria-label="The crew introduces itself">
        {perf.lines.map((l, i) => (
          <p
            key={l.id}
            className="crew-perf-line"
            data-spoken={i < state.linesSpoken ? "yes" : "no"}
          >
            <CrewAvatar id={l.id} state={avatarState(i)} size={32} decorative className="crew-perf-avatar" />
            <span className="crew-perf-agent">{l.agent}</span>
            <span className="crew-perf-role">{l.role}</span>
            {l.text}
          </p>
        ))}
      </div>

      <div className="crew-perf-days" aria-label="The plan locks, day by day">
        {perf.days.map((d, i) => {
          const phase = state.days[i];
          return (
            <div key={d.dayIndex} className="crew-perf-day" data-phase={phase}>
              <span className="crew-perf-day-label">{d.label}</span>
              {/* The lane is attribute-only SVG — one diamond per cue,
                  positioned by the model. No inline styles: the hue rides
                  the shared data-cat law, the entrance rides CSS. */}
              <svg className="crew-perf-lane" viewBox="0 0 1440 14" preserveAspectRatio="none" aria-hidden="true">
                {d.cues.map((c) => {
                  const x = c.startMin;
                  return (
                    <polygon
                      key={`${c.kind}-${c.startMin}`}
                      className="crew-perf-cue"
                      data-cat={KIND_TO_CAT[c.kind] ?? "calendar"}
                      points={`${x},2 ${x + 5},7 ${x},12 ${x - 5},7`}
                    >
                      <title>{`${c.label} ${fmtMin(c.startMin)}`}</title>
                    </polygon>
                  );
                })}
              </svg>
              <span
                className="crew-perf-stamp"
                data-pass={phase === "locked" ? (d.verdict.pass ? "yes" : "no") : "no"}
                title={phase === "locked" ? `Gate score ${d.verdict.score.toFixed(2)}` : undefined}
              >
                {phase !== "locked"
                  ? phase === "draft"
                    ? "draft"
                    : ""
                  : d.verdict.pass
                    ? "Passes"
                    : `Needs a fix · ${d.verdict.violations.join(", ") || "below standard"}`}
                {phase === "locked" && (
                  <span className="crew-perf-sr">{` Gate score ${d.verdict.score.toFixed(2)}`}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="crew-perf-read" aria-live="polite">
        {done
          ? `${perf.days.length} days locked · ${bankedH.toFixed(1)}h banked · every stamp is the gate's own verdict`
          : "The crew is solving live — every stamp will be the gate's own verdict."}
      </p>

      {!compact && !reduced && (
        <div className="crew-perf-controls">
          {!done ? (
            <button type="button" onClick={() => setPos(steps.length - 1)}>Skip to the verdicts →</button>
          ) : (
            <button type="button" onClick={() => setPos(0)}>Replay the crew</button>
          )}
        </div>
      )}
    </div>
  );
}
