"use client";

import { useMemo } from "react";
import { TimezoneClocks } from "@/components/TimezoneClocks";
import { StageStars } from "@/components/StageStars";
import { StageRidges } from "@/components/StageRidges";
import { SunSelf } from "@/components/SunSelf";
import { fmtMin } from "@/domain/circadian";
import type { TravelerNudge } from "@/domain/nudges";
import { stageSkyFor } from "@/domain/stage-sky";
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

  return (
    <section
      className="today-stage"
      style={stageSkyFor(trip, owedMin, liveDate)}
      aria-label={`Today — ${trip.destination.name}. ${sun.line}`}
    >
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
