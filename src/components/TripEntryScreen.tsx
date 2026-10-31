"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { RoutePicker } from "@/components/RoutePicker";
import { isValidHomeRoute, type HomeRoute } from "@/lib/home-entry";
import { SampleJourneys } from "@/components/SampleJourneys";
import type { DemoScenarioId } from "@/domain/demo-scenarios";

export interface TripEntryScreenProps {
  initialDate: string;
  onContinue: (route: HomeRoute) => void;
  onExploreExample: () => void;
  onExploreScenario?: (id: DemoScenarioId) => void;
  initialRoute?: HomeRoute | null;
}

export function TripEntryScreen({ initialDate, onContinue, onExploreExample, onExploreScenario, initialRoute }: TripEntryScreenProps) {
  const [draft, setDraft] = useState<HomeRoute>(
    initialRoute && isValidHomeRoute(initialRoute) ? initialRoute : { origin: "", dest: "", date: initialDate },
  );
  const valid = isValidHomeRoute(draft);
  const sameAirports =
    !!draft.origin && !!draft.dest && draft.origin.toUpperCase() === draft.dest.toUpperCase();

  return (
    <div className="reading entry" role="group" aria-labelledby="entry-heading">
      <div className="entry-intro">
        <p className="entry-eyebrow">Arrive with a plan</p>
        <h1 id="entry-heading" className="entry-title">Show up for what matters.</h1>
        <p className="entry-sub">Time your light, sleep and caffeine around the trip. Then make room for something that feels like you.</p>
        <div className="entry-story" aria-label="How Meridian helps">
          <div><span>Before the big moment</span><p>Light and rest, timed to your journey.</p></div>
          <div><span>Between the commitments</span><p>Places worth looking forward to, shaped by your taste.</p></div>
        </div>
        <p className="entry-source">Sleep timing from your trip. Place discovery powered by Qloo when available.</p>
      </div>
      <div className="entry-planner">
        <p className="entry-eyebrow">Start with your trip</p>
        <h2>Where are you headed?</h2>
        <p className="entry-planner-note">Choose your airports and departure date. We’ll take it one day at a time.</p>
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
          <div className="entry-helper">
            {sameAirports ? (
              <p role="alert" className="entry-error">Choose different departure and destination airports.</p>
            ) : (
              <p>Pick an airport from the suggestions to continue.</p>
            )}
          </div>
          <button type="submit" className="entry-cta" disabled={!valid}>
            See my trip plan <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>
        <div className="entry-example-row">
          <span>Just looking around?</span>
          <button type="button" className="entry-example" onClick={onExploreExample}>Explore an example</button>
        </div>
        <p className="entry-privacy">No account needed to get started.</p>
      </div>
      {onExploreScenario && <SampleJourneys onChoose={onExploreScenario} />}
    </div>
  );
}
