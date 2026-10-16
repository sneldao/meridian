"use client";

import type { Trip } from "@/domain/types";

interface TripSummaryProps {
  trip: Trip;
  onEdit: () => void;
}

/**
 * The one-line trip identity that sits above Today, with the way back into
 * setup. On the Calm rung `/` is a single flow — the trip is a fact you
 * already gave, not a section you configure — so this replaces the old
 * "Trip & Flight Setup" screen and its numbered sections.
 */
export function TripSummary({ trip, onEdit }: TripSummaryProps) {
  const { origin, destination, direction, requiredShiftMin } = trip;
  const shiftHours = Math.max(1, Math.round(Math.abs(requiredShiftMin) / 60));
  const shiftLabel = `${shiftHours}h ${direction === "east" ? "east" : "west"}`;

  const dateLabel = (() => {
    const departure = trip.days.find(
      (d) => d.dayIndex === trip.departureDayIndex,
    );
    if (!departure?.date) return null;
    const dt = new Date(`${departure.date}T12:00:00`);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  })();

  return (
    <div className="trip-summary rise" style={{ animationDelay: ".05s" }}>
      <span className="route">
        {origin.code} <span aria-hidden="true">→</span>
        <span className="sr-only">to</span> {destination.code}
      </span>
      {dateLabel && <span className="when">{dateLabel}</span>}
      <span className="shift">{shiftLabel}</span>
      <button type="button" className="edit" onClick={onEdit}>
        Edit
      </button>
    </div>
  );
}