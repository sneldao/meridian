"use client";

import { useMemo } from "react";
import { TimezoneClocks } from "@/components/TimezoneClocks";
import { fmtMin } from "@/domain/circadian";
import type { TravelerNudge } from "@/domain/nudges";
import { stageSkyFor } from "@/domain/stage-sky";
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
}

export function TodayStage({
  trip,
  owedMin,
  bodyShiftMin,
  nudges,
  marks,
  routeOpen,
  onChip,
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
      aria-label="Today"
    >
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
          {nudges === null ? (
            "The crew is reading your route."
          ) : next ? (
            <>
              <span className="stage-next-kicker">Next</span>{" "}
              <b>{fmtMin(next.startMin)}</b> · {next.title}
            </>
          ) : (
            "Everything is placed for today."
          )}
        </p>

        <p className="stage-cue" aria-hidden="true">
          ↓
        </p>
      </div>
    </section>
  );
}
