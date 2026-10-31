"use client";

import { useState } from "react";
import { RoutePicker } from "@/components/RoutePicker";
import { isValidHomeRoute, type HomeRoute } from "@/lib/home-entry";

export interface TripEntryScreenProps {

  initialDate: string;
  onContinue: (route: HomeRoute) => void;
  onExploreExample: () => void;
}

export function TripEntryScreen({ initialDate, onContinue, onExploreExample }: TripEntryScreenProps) {
  const [draft, setDraft] = useState<HomeRoute>({ origin: "", dest: "", date: initialDate });
  const valid = isValidHomeRoute(draft);
  const sameAirports =
    !!draft.origin && !!draft.dest && draft.origin.toUpperCase() === draft.dest.toUpperCase();

  return (
    <div className="reading entry" role="group" aria-labelledby="entry-heading">
      <h1 id="entry-heading" className="entry-title">Arrive better adjusted.</h1>
      <p className="entry-sub">
        A daily plan for sleep, light and caffeine, timed to your trip.
      </p>
      <form
        className="entry-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) {
            onContinue({
              origin: draft.origin.toUpperCase(),
              dest: draft.dest.toUpperCase(),
              date: draft.date,
            });
          }
        }}
      >
        <RoutePicker
          origin={draft.origin}
          dest={draft.dest}
          date={draft.date}
          surface="cream"
          onChange={(next) =>
            setDraft({ origin: next.origin, dest: next.dest, date: next.date })
          }
        />
        {sameAirports && (
          <p role="alert" className="entry-error">
            Choose different departure and destination airports.
          </p>
        )}
        <button type="submit" className="entry-cta" disabled={!valid}>
          Continue
        </button>
      </form>
      <button type="button" className="entry-example" onClick={onExploreExample}>
        Explore an example
      </button>
    </div>
  );
}
