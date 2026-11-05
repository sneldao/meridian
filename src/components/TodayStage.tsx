"use client";

import { useMemo, useRef } from "react";
import { TimezoneClocks } from "@/components/TimezoneClocks";
import { StageStars } from "@/components/StageStars";
import { StageRidges } from "@/components/StageRidges";
import { StageArc } from "@/components/StageArc";
import { MeridianSkyCanvas } from "@/components/MeridianSkyCanvas";
import { cssRgb, type MeridianSkyState } from "@/lib/meridian-sky-webgl";
import { useState } from "react";
import { SunSelf } from "@/components/SunSelf";
import { fmtMin } from "@/domain/circadian";
import type { TravelerNudge } from "@/domain/nudges";
import { stageSkyFor } from "@/domain/stage-sky";
import { useDepthParallax } from "@/lib/motion/depth-parallax";
import { sunSelfRead } from "@/domain/sun-self";
import { nowMinOnDay, pickNextStep, todayDayIndex } from "@/domain/today";
import type { ActionMark } from "@/lib/trip-actions";
import { useLiveDate } from "@/lib/use-live-date";
import type { Trip } from "@/domain/types";

/* Round 20: Today's first paint is a full-bleed stage, not a card column.
 *
 *  The stage carries exactly four things: the sky (the body clock's — it
 *  drifts with the real sun), the route, the two clocks, and the one next
 *  step. Everything else waits below and unfolds on scroll. The next line
 *  derives from the same pickNextStep the feed trusts, with the same marks,
 *  so the stage never advertises a step the feed won't confirm. */

export interface TodayStageProps {
  trip: Trip;
  /** Minutes the body clock still owes — feeds the sky's dawn depth. */
  owedMin: number;
  /** Minutes already banked across locked days — feeds the clocks. */
  bodyShiftMin: number;
  /** Today's steps once a plan exists; null before. */
  nudges: TravelerNudge[] | null;
  marks: ActionMark[];
  routeOpen: boolean;
  onChip: () => void;
  /** True only while a crew run is genuinely live — the stage may then say
   *  the crew is reading the route. Never use the line as a default. */
  running?: boolean;
  /** Show the run's door on the stage (trip mode, nothing locked yet). */
  canStart?: boolean;
  onStart?: () => void;
  /** How many days of the window the crew has locked — the sky face's rays. */
  daysLocked?: number;
}

export function TodayStage({
  trip,
  owedMin,
  bodyShiftMin,
  nudges,
  marks,
  routeOpen,
  onChip,
  running = false,
  canStart = false,
  onStart,
  daysLocked = 0,
}: TodayStageProps) {
  // The sky and the next line share one clock — the live date ticks so both
  // drift with the real sun without a page-level re-render.
  const liveDate = useLiveDate(30_000);
  // The visitor's hand tilts the diorama — --px/--py drift the sky's planes
  // at their own depths; instruments stay still, they are the read.
  const stageRef = useRef<HTMLElement>(null);
  useDepthParallax(stageRef);
  // The painted world — when WebGL is alive the DOM depth layers stand down;
  // reduced-motion and context loss keep the CSS stack as the same scene.
  const [skyLive, setSkyLive] = useState(false);

  const next = useMemo(() => {
    const now = liveDate ?? new Date();
    const idx = todayDayIndex(trip, now);
    if (idx === null || !nudges) return null;
    const completed = new Set(
      marks.filter((m) => m.dayIndex === idx).map((m) => m.id),
    );
    return pickNextStep(nudges, completed, nowMinOnDay(trip, idx, now)).next ?? null;
  }, [trip, nudges, marks, liveDate]);

  const departure = trip.days.find((d) => d.dayIndex === trip.departureDayIndex);

  // The sun in this sky is the traveller: the same face the demo shows and
  // the passport stamps — debt for lids, banked shift for light, locked days
  // for rays. It lights on every genuine step forward (a done check-in
  // remounts the pulse by key); a skip changes nothing — zero-guilt by
  // design, the light simply stays where it is.
  const required = Math.abs(trip.requiredShiftMin);
  const sun = sunSelfRead({
    owedMin,
    deliveredMin: Math.max(0, required - owedMin),
    requiredMin: required,
    direction: trip.direction,
    daysLocked,
  });
  const lastDone = marks.filter((m) => m.status === "done").at(-1);
  const dateLabel = departure?.date
    ? new Date(`${departure.date}T12:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "";

  const skyVars = stageSkyFor(trip, owedMin, liveDate) as Record<string, string>;
  // The scene's state is the same model the DOM writes as vars — parsed back
  // so the canvas can never disagree with the CSS fallback beside it.
  const skyState = (w: number, h: number): MeridianSkyState => {
    const hor = cssRgb(skyVars["--stage-horizon"], [0.91, 0.6, 0.44]);
    const zen = cssRgb(skyVars["--stage-ink-2"], [0.047, 0.07, 0.125]);
    const horH = (parseFloat(skyVars["--stage-horizon-h"] ?? "26") || 26) / 100;
    const s = Math.min(220, Math.max(140, w * 0.15));
    const strip = Math.min(560, w * 0.58);
    const left = (w - strip) / 2;
    return {
      top: [zen[0] * 0.55, zen[1] * 0.55, zen[2] * 0.7],
      mid: zen,
      hor,
      horizonH: horH,
      stars: parseFloat(skyVars["--stage-star-o"] ?? "0") || 0,
      cover: Math.min(1, owedMin / Math.max(1, required)),
      sun: { x: (18 + s / 2) / w, y: horH + 8 / h, r: s / 2 / h, color: hor },
      arc: {
        ax: (left + 0.04 * strip) / w,
        ay: horH - 0.06,
        bx: (left + 0.96 * strip) / w,
        by: horH - 0.06,
        t: sun.glow,
      },
      // The crew rides ahead of the body's marker — scouts out on the route
      // the run already flew, spaced down the arc from where the body is.
      scouts: [0.12, 0.2, 0.09, 0.16, 0.06].map((f) =>
        Math.min(0.97, sun.glow + f),
      ),
    };
  };

  return (
    <section
      ref={stageRef}
      className={`today-stage${skyLive ? " sky-gl" : ""}`}
      style={skyVars}
      aria-label={`Today — ${trip.destination.name}. ${sun.line}`}
    >
      {/* the world — one painted scene behind every DOM read; when it lives,
          the DOM stars/ridge/arc stand down (they remain the fallback) */}
      <MeridianSkyCanvas state={skyState} onLive={setSkyLive} />
      {/* the modeled darkness — the same star field the demo hangs, fading
          as the body sun climbs (stage-sky's starFade via --stage-star-o) */}
      <StageStars seed={`stage-${trip.destination.name}`} />
      {/* the traveller's meridian, on the horizon where the sun belongs —
          size mirrors --stage-sun-size in globals.css (pinned in tests) */}
      <div className="stage-sunself">
        {/* 240px backing so the glass reads sharp at any display size —
            --stage-sun-size (clamp) owns the box it scales into. */}
        <SunSelf read={sun} size={240} tone="ink" pulseKey={lastDone?.at ?? null} />
      </div>
      {/* the ground the sun rises over — far ridge clips the disc's lower
          sliver so it reads as land, not a floating gradient */}
      <StageRidges seed={`ridge-${trip.destination.name}`} />
      {/* the route itself on the horizon — origin → terminator →
          destination, the body clock's marker riding its coverage */}
      {liveDate && <StageArc trip={trip} coverage={sun.glow} date={liveDate} />}
      <div className="today-stage-inner">
        <button
          type="button"
          className="trip-chip stage-chip"
          onClick={onChip}
          aria-expanded={routeOpen}
        >
          {trip.origin.name} → {trip.destination.name}
          {dateLabel ? <span className="trip-chip-date"> · {dateLabel}</span> : null}
          {" · "}
          {Math.abs(trip.requiredShiftMin / 60)}h{" "}
          {trip.direction === "east" ? "ahead" : "behind"}{" "}
          <span className="trip-chip-change">✎ Change</span>
        </button>

        <TimezoneClocks
          origin={trip.origin}
          destination={trip.destination}
          requiredShiftMin={trip.requiredShiftMin}
          bodyShiftMin={bodyShiftMin}
        />

        <p className="stage-next" aria-live="polite">
          {running ? (
            // The one time the line is true: a run is actually streaming.
            "The crew is reading your route."
          ) : nudges === null ? (
            // No step for today yet — the plan below is a preview, and the
            // stage says so instead of pretending to load.
            <>
              <span className="stage-next-kicker">Planning ahead</span> Your
              days unfold below.
            </>
          ) : next ? (
            <>
              <span className="stage-next-kicker">Next</span>{" "}
              <b>{fmtMin(next.startMin)}</b> · {next.title}
            </>
          ) : (
            "Everything is placed for today."
          )}
        </p>

        {/* The run's own door, where the eye already is — same words as the
            setup sheet's CTA, so the two never disagree. */}
        {canStart && !running && onStart && (
          <button type="button" className="taste-button taste-button--ghost stage-start" onClick={onStart}>
            Make my plan
          </button>
        )}

        <p className="stage-cue" aria-hidden="true">
          ↓
        </p>
      </div>
    </section>
  );
}
