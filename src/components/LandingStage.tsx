"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import Link from "next/link";
import { CountUp } from "@/components/CountUp";
import { LandingCrewStrip } from "@/components/LandingCrewStrip";
import { SunSelf } from "@/components/SunSelf";
import { clockLabel, demoJourney, sunSelfForBeat } from "@/domain/demo-beats";
import type { DemoJourney } from "@/domain/demo-beats";
import { landingFrame, type LandingVisitor } from "@/domain/landing-stage";
import { routeGapHeadline, type RouteGapRead } from "@/domain/route-gap";
import { arrivalPassportSvg } from "@/lib/arrival-passport-svg";
import { stageSky, stageSkyVars, STAGE_SKY_VARS } from "@/domain/stage-sky";
import { stageSunVars, STAGE_SUN_VARS } from "@/domain/stage-sun";
import { sunSelfMoodWord, type SunSelfRead } from "@/domain/sun-self";

/* The landing is the flight (round 30). One pinned ink stage scrubbed by
 *  scroll — the visitor flies the demo journey end to end:
 *
 *    the gap      — two dawn lines held apart by the 9.0h still owed
 *    night before — the crew performance, agents and locks computed
 *    the crossing — the sun travels its modeled arc; banked hours ease in,
 *                   the dawns converge, the face recomputes live
 *    the morning  — the jagged-edge takeover (the lookbook grammar at
 *                   stage scale), honestly scored
 *
 *  Every figure comes from `landingFrame(journey, p)` — stageSky, the
 *  body-solar altitude, the ghost separation and the sun-self read are all
 *  model output at that progress, never a tweened fake. The smear reel's
 *  tempo law holds: scroll velocity stretches the halo, nothing idles.
 *
 *  The written-read law (Rule 2): without JS or under reduced motion the
 *  stage never arms — `data-staged` stays "no" and the same markup renders
 *  as stacked written sections, complete and readable. The performance is
 *  the enhancement, never the only route to the fact. */

/** The lookbook's jagged edge, reused at stage scale for the morning reveal. */
const EDGE_DOWN =
  "polygon(0% 102%, 14% 102%, 28% 102%, 42% 102%, 57% 102%, 71% 102%, 85% 102%, 100% 102%, 100% 102%, 0% 102%)";
const EDGE_JAG =
  "polygon(0% 6%, 14% 12%, 28% 3%, 42% 10%, 57% 4%, 71% 11%, 85% 5%, 100% 9%, 100% 102%, 0% 102%)";
const EDGE_FULL =
  "polygon(0% 0%, 14% 0%, 28% 0%, 42% 0%, 57% 0%, 71% 0%, 85% 0%, 100% 0%, 100% 102%, 0% 102%)";

/** A 24-hour ring with two hands — the destination clock and the body the
 *  flight carries in. Pure SVG, attribute transforms only. */
function MiniDial({ localMin, bodyMin }: { localMin: number; bodyMin: number }) {
  const angle = (min: number) => (min / 1440) * 360;
  return (
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Tokyo ${clockLabel(localMin)}, body time ${clockLabel(bodyMin)}`}
    >
      <circle cx="60" cy="60" r="52" className="ld-ring" />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1="60"
          y1="10"
          x2="60"
          y2="16"
          className="ld-tick"
          transform={`rotate(${i * 30} 60 60)`}
        />
      ))}
      <line
        x1="60"
        y1="60"
        x2="60"
        y2="18"
        className="ld-hand-local"
        transform={`rotate(${angle(localMin)} 60 60)`}
      />
      <line
        x1="60"
        y1="60"
        x2="60"
        y2="28"
        className="ld-hand-body"
        transform={`rotate(${angle(bodyMin)} 60 60)`}
      />
      <circle cx="60" cy="60" r="3.5" className="ld-pin" />
    </svg>
  );
}

const noopSubscribe = () => () => {};
const getMounted = () => true;
const getUnmounted = () => false;

export function LandingStage({
  journey,
  visitor,
}: {
  journey?: DemoJourney;
  /** The visitor's resolved route + solver coverage — when present the
   *  stage plays the same arc at their scale (round 30 phase 3). */
  visitor?: { gap: RouteGapRead; covPct: number | null } | null;
}) {
  const j = useMemo(() => journey ?? demoJourney("miles"), [journey]);
  const reduced = useReducedMotion();

  // Their route, in the frame's own vocabulary. The banked ratio is the
  // solver preview's coverage for their route; when it can't place, the
  // demo's own ratio stands in — the arc stays honest either way.
  const visitorFrame = useMemo<LandingVisitor | null>(() => {
    if (!visitor) return null;
    const p = j.read.projection;
    const demoRatio = p && p.requiredHours > 0 ? p.deliveredHours / p.requiredHours : 0.5;
    return {
      requiredMin: visitor.gap.gapMin,
      signedShiftMin: visitor.gap.signedShiftMin,
      direction: visitor.gap.direction,
      destLat: visitor.gap.destLat,
      destLon: visitor.gap.destLon,
      bankedRatio: visitor.covPct != null ? visitor.covPct / 100 : demoRatio,
    };
  }, [visitor, j]);

  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });

  // The performance arms only on the client and only when motion is
  // allowed — SSR and reduced motion keep the stacked written read.
  const mounted = useSyncExternalStore(noopSubscribe, getMounted, getUnmounted);
  const staged = mounted && !reduced;

  // The traveller's face rides the whole stage. SSR + first paint is the
  // stakes read — drained, the honest face of a 9.0h gap.
  const [face, setFace] = useState<SunSelfRead>(() => sunSelfForBeat(j, "stakes"));
  // Beats mount their interactive content only while their window is near —
  // the crew strip would otherwise play through before it is scrolled to,
  // and the scorecard counts at the reveal, not the load.
  const [crewOn, setCrewOn] = useState(false);
  const [mornSeen, setMornSeen] = useState(false);
  const stagedRef = useRef(false);
  const lastSmear = useRef({ p: 0, at: 0 });
  const faceSig = useRef("");
  // The dawn-drag (beat 0): the visitor may explore the plan's range — the
  // domain clamps it to [full debt … what the plan carries], never past.
  const scrubRef = useRef<number | null>(null);
  useEffect(() => {
    scrubRef.current = null;
  }, [visitorFrame]);

  const applyFrame = useCallback((p: number) => {
    const el = stageRef.current;
    if (!el || !stagedRef.current) return;
    const f = landingFrame(j, p, visitorFrame, p < 0.2 ? scrubRef.current : null);
    const signedShift = visitorFrame?.signedShiftMin ?? j.trip.requiredShiftMin;
    const sky = stageSkyVars(stageSky(f.bodyAltDeg, f.owedMin, signedShift)) as Record<
      string,
      string
    >;
    for (const name of STAGE_SKY_VARS) el.style.setProperty(name, sky[name]);
    const sun = stageSunVars(f.sun);
    for (const name of STAGE_SUN_VARS) el.style.setProperty(name, sun[name]);
    el.style.setProperty("--ls-gap", f.ghostRatio.toFixed(3));

    // The smear reel's one borrowed idea: scroll velocity stretches the
    // halo along the travel axis, then the CSS transition relaxes it.
    const at = Date.now();
    const prev = lastSmear.current;
    let smear = 0;
    if (prev.at && at > prev.at) {
      const v = Math.abs(p - prev.p) / ((at - prev.at) / 1000);
      smear = Math.min(1, Math.max(0, (v - 0.4) / 1.6));
    }
    lastSmear.current = { p, at };
    el.style.setProperty("--stage-sun-smear", smear.toFixed(3));

    // The face recomputes from the frame — re-render only when the read
    // materially changes (quantised, so a slow scroll doesn't churn).
    const sig = `${f.face.mood}|${f.face.raysLit}|${f.face.lid.toFixed(2)}|${f.face.glow.toFixed(
      2,
    )}|${Math.round(f.face.tiltDeg)}`;
    if (sig !== faceSig.current) {
      faceSig.current = sig;
      setFace(f.face);
    }
    setCrewOn(p > 0.16);
    setMornSeen(p > 0.78);
  }, [j, visitorFrame]);

  useMotionValueEvent(scrollYProgress, "change", applyFrame);
  // Arm the imperative writer and paint the current frame once staged.
  useEffect(() => {
    stagedRef.current = staged;
    if (staged) applyFrame(scrollYProgress.get());
    return () => {
      stagedRef.current = false;
    };
  }, [staged, scrollYProgress, applyFrame]);

  // Beat windows — opacity eases in/out; visibility follows the window so
  // hidden beats leave the tab order and the hit test entirely.
  const heroO = useTransform(scrollYProgress, [0, 0.13, 0.19], [1, 1, 0]);
  const crewO = useTransform(scrollYProgress, [0.2, 0.26, 0.36, 0.42], [0, 1, 1, 0]);
  const hudO = useTransform(scrollYProgress, [0.42, 0.48, 0.7, 0.76], [0, 1, 1, 0]);
  const mornInnerO = useTransform(scrollYProgress, [0.84, 0.9], [0, 1]);
  const heroVis = useTransform(scrollYProgress, (p) => (p < 0.2 ? "visible" : "hidden"));
  const crewVis = useTransform(scrollYProgress, (p) =>
    p > 0.17 && p < 0.44 ? "visible" : "hidden",
  );
  const hudVis = useTransform(scrollYProgress, (p) =>
    p > 0.4 && p < 0.78 ? "visible" : "hidden",
  );
  const mornVis = useTransform(scrollYProgress, (p) => (p > 0.72 ? "visible" : "hidden"));
  const mornClip = useTransform(scrollYProgress, [0.74, 0.8, 0.86], [EDGE_DOWN, EDGE_JAG, EDGE_FULL]);

  // The HUD counters read the same frame the sky and face do — the numbers
  // the visitor sees are the numbers the model computed.
  const bankedText = useTransform(scrollYProgress, (p) =>
    (landingFrame(j, p, visitorFrame).bankedMin / 60).toFixed(1),
  );
  const owedText = useTransform(scrollYProgress, (p) =>
    (landingFrame(j, p, visitorFrame).owedMin / 60).toFixed(1),
  );
  const requiredMin = visitor?.gap.gapMin ?? Math.abs(j.trip.requiredShiftMin);
  const bankedCapMin = visitorFrame
    ? requiredMin * Math.max(0, Math.min(1, visitorFrame.bankedRatio))
    : (j.read.projection?.deliveredHours ?? 0) * 60;
  const requiredH = (requiredMin / 60).toFixed(1);
  const dawnDir = visitor?.gap.direction ?? j.trip.direction;
  const dawnDest = visitor?.gap.destName ?? j.trip.destination.name;

  const p = j.read.projection;
  const sunLabel = `The traveller's meridian — ${sunSelfMoodWord(face.mood)} — ${face.line}`;

  return (
    <div className="ls-track" ref={trackRef} data-staged={staged ? "yes" : "no"}>
      <div className="landing-stage" ref={stageRef}>
        {/* The two dawns — destination fixed, the body's drifting home as
            hours bank. Separation is --ls-gap, the model's owed ratio.
            West routes draw the ghost on the far side. */}
        <div className={`ls-dawns${dawnDir === "west" ? " west" : ""}`} aria-hidden="true">
          <i className="ls-dawn ls-dawn-ghost" />
          <i className="ls-dawn ls-dawn-dest" />
          <span className="ls-dawn-tag ls-dawn-tag-ghost">your body&apos;s dawn</span>
          <span className="ls-dawn-tag ls-dawn-tag-dest">{dawnDest}&apos;s dawn</span>
        </div>

        {/* Beat 0 — the gap. Pain once, mechanism once, two ways in. */}
        <motion.section
          className="ls-beat ls-hero"
          aria-label="The gap"
          style={staged ? { opacity: heroO, visibility: heroVis } : undefined}
        >
          <h2 className="landing-tease-title">Arrive better adjusted</h2>
          <p className="ls-pain">
            {visitor
              ? routeGapHeadline(visitor.gap)
              : `Your ${clockLabel(j.moment.localMin)} ${j.trip.destination.name} meeting is ${clockLabel(j.moment.bodyWithoutPlanMin)} body time.`}
          </p>
          <p className="ls-mech">
            Meridian retimes light, sleep and caffeine across the days around the flight — and
            scores what you banked.
          </p>
          <p className="ls-cta-row">
            <a href="#trip-entry" className="landing-tease-cta">
              Start with your trip
            </a>
            <Link href="/demo" className="ls-cta-ghost" transitionTypes={["nav-forward"]}>
              Watch the ninety-second example
            </Link>
          </p>
          {/* The dawn-drag: explore the plan's honest range — from the full
              debt down to what the plan carries, never past it (the domain
              clamps). The dawns, sun, sky and face all answer live. */}
          {staged && (
            <p className="ls-drag">
              <input
                key={`${requiredMin}-${bankedCapMin}`}
                type="range"
                min={requiredMin - bankedCapMin}
                max={requiredMin}
                step={5}
                defaultValue={requiredMin}
                aria-label="Explore the plan's range — drag your body's dawn toward the destination's"
                onChange={(e) => {
                  scrubRef.current = Number(e.target.value);
                  applyFrame(scrollYProgress.get());
                }}
              />
              <span className="ls-drag-note">
                drag your body&rsquo;s dawn — the plan&rsquo;s honest range
              </span>
            </p>
          )}
        </motion.section>

        {/* Beat 1 — the night before. The crew performs; the strip below
            names what they time, in one line. */}
        <motion.section
          className="ls-beat ls-crew"
          aria-label="The night before"
          style={staged ? { opacity: crewO, visibility: crewVis } : undefined}
        >
          <p className="ls-moment">D-5 · the night before</p>
          {/* Staged: the strip mounts only when its window nears, so the
              performance plays on arrival, not on page load. Unstaged (SSR
              + reduced motion): it renders in full — the written read. */}
          {(!staged || crewOn) && <LandingCrewStrip />}
          <p className="ls-caption">
            daylight · light avoidance · sleep windows · caffeine cutoffs · exercise · meals
          </p>
        </motion.section>

        {/* Beat 2 — the crossing. The sun is the motion; the HUD keeps the
            written read: both clocks, and the honest tally. */}
        <motion.div
          className="ls-hud"
          aria-label="Mid-crossing"
          style={staged ? { opacity: hudO, visibility: hudVis } : undefined}
        >
          <span className="ls-hud-dial" aria-hidden="true">
            <MiniDial localMin={j.moment.localMin} bodyMin={j.moment.bodyWithoutPlanMin} />
          </span>
          <p className="ls-hud-nums">
            <span className="ls-moment">Mid-crossing</span>
            <motion.b>{bankedText}</motion.b>h banked of {requiredH}h needed
            <span className="ls-hud-owed">
              doing nothing would owe {requiredH}h · still owed <motion.b>{owedText}</motion.b>h
            </span>
          </p>
        </motion.div>

        {/* Beat 3 — the first morning. The crossing's ink is clipped away on
            the jagged edge and the scorecard arrives with the light. */}
        <motion.div
          className="ls-morning"
          aria-label="The first morning"
          style={staged ? { clipPath: mornClip, visibility: mornVis } : undefined}
        >
          <motion.div className="ls-morning-inner" style={staged ? { opacity: mornInnerO } : undefined}>
            <p className="ls-moment">The first morning, honestly scored</p>
            <div className="ls-morning-cards">
              <div className="ld-card">
                <p className="ld-score">
                  {p && (
                    <>
                      <b>
                        <CountUp value={mornSeen || !staged ? p.deliveredHours.toFixed(1) : "0.0"} />h
                      </b>
                      <small>
                        banked of <CountUp value={mornSeen || !staged ? p.requiredHours.toFixed(1) : "0.0"} />h
                        needed
                      </small>
                      <span className="ld-score-line">
                        doing nothing would owe{" "}
                        <CountUp value={mornSeen || !staged ? p.baselineHours.toFixed(1) : "0.0"} />h
                      </span>
                    </>
                  )}
                </p>
                <p className="ld-cap">
                  <b>Arrival scorecard</b>
                  <small>the plan carried {p ? p.deliveredHours.toFixed(1) : "—"}h</small>
                </p>
              </div>
              <div className="ld-card">
                {j.passport ? (
                  <span
                    className="ld-passport"
                    aria-label="Example stamped arrival passport"
                    dangerouslySetInnerHTML={{
                      __html: arrivalPassportSvg(j.passport, sunSelfForBeat(j, "payoff")),
                    }}
                  />
                ) : (
                  <p className="ld-score">
                    <b>—</b>
                    <small>nothing to stamp yet</small>
                  </p>
                )}
                <p className="ld-cap">
                  <b>Shareable passport</b>
                  <small>stamped only with what the read carries</small>
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* The traveller — the stage's constant, above every beat. It lands
            the morning the way the hero promised it would. */}
        <div className="stage-sun" role="img" aria-label={sunLabel}>
          <div className="stage-sun-smear" aria-hidden="true" />
          <div className="stage-sun-halo" aria-hidden="true" />
          <div className="stage-sun-disc">
            <SunSelf read={face} tone="ink" pulseKey={face.mood} className="stage-sun-face" />
          </div>
        </div>
      </div>
    </div>
  );
}
