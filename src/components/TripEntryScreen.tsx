"use client";

import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { RoutePicker } from "@/components/RoutePicker";
import { isValidHomeRoute, type HomeRoute } from "@/lib/home-entry";
import { SampleJourneys } from "@/components/SampleJourneys";
import type { DemoScenarioId } from "@/domain/demo-scenarios";
import { ADHERENCE_PROFILE, buildTrip, DEMO_TRIP } from "@/domain/fixtures";
import { previewPlan, type SolvedDay } from "@/domain/solver";
import { coverageOf, fmtMin } from "@/domain/circadian";
import { INTERVENTION_ICONS } from "@/lib/intervention-icons";
import type { CityCode, Trip } from "@/domain/types";

/** What a plan looks like when it lands — computed, not mocked. The example
 *  trip runs the real solver once and the tiles show real numbers. */
function demoArtifacts() {
  const solved = previewPlan({ trip: DEMO_TRIP, calendar: [], adherence: ADHERENCE_PROFILE });
  const days = [...solved.values()].filter((s): s is SolvedDay => !!s).map((s) => s.plan);
  const cov = coverageOf(DEMO_TRIP, days);
  const cues = (days[0]?.interventions ?? [])
    .filter((i) => i.kind === "light_exposure" || i.kind === "caffeine_cutoff" || i.kind === "sleep_window")
    .slice(0, 3);
  return { shift: Math.abs(DEMO_TRIP.requiredShiftMin), cov, cues };
}

function planPreview(route: HomeRoute): { shift: number; lightStart?: number; covPct: number } | null {
  try {
    const t: Trip = buildTrip(route.origin.toUpperCase() as CityCode, route.dest.toUpperCase() as CityCode, route.date);
    const solved = previewPlan({ trip: t, calendar: [], adherence: ADHERENCE_PROFILE });
    const days = [...solved.values()].filter((s): s is SolvedDay => !!s).map((s) => s.plan);
    if (!days.length) return null;
    const light = days.flatMap((d) => d.interventions).find((i) => i.kind === "light_exposure");
    return {
      shift: Math.abs(t.requiredShiftMin),
      lightStart: light?.startMin,
      covPct: Math.round(coverageOf(t, days).ratio * 100),
    };
  } catch {
    return null; // airports outside the registry — no preview, never a fake
  }
}

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
  const preview = useMemo(() => (valid ? planPreview(draft) : null), [draft, valid]);
  const artifacts = useMemo(() => demoArtifacts(), []);

  return (
    <div className="reading entry" role="group" aria-labelledby="entry-heading">
      <div className="entry-intro">
        <p className="entry-eyebrow">Arrive with a plan</p>
        <h1 id="entry-heading" className="entry-title">Your 07:00 meeting in Tokyo is 23:00 body time.</h1>
        <p className="entry-sub">Meridian&rsquo;s crew moves it — or moves you. Light, sleep and caffeine, timed to your route and shown to the minute.</p>
        <div className="entry-story" aria-label="How Meridian helps">
          <div><span>Before the big moment</span><p>Light and rest, timed to your journey.</p></div>
          <div><span>Between the commitments</span><p>Places worth looking forward to, shaped by your taste.</p></div>
        </div>
        {/* What the product actually produces — real solver output for the
            example trip, labelled as such, never marketing copy. */}
        <div className="mt-3 grid grid-cols-3 gap-2" aria-label="What a Meridian plan looks like — example trip">
          <div className="rounded-lg border border-line px-2.5 py-2">
            <p className="m-0 font-mono2 text-2xs text-dim">the gap</p>
            <p className="m-0 text-sm font-bold text-paper">{(artifacts.shift / 60).toFixed(1)}h to move</p>
            <p className="m-0 text-2xs text-dim">LHR → HND, east</p>
          </div>
          <div className="rounded-lg border border-line px-2.5 py-2">
            <p className="m-0 font-mono2 text-2xs text-dim">the plan, day 1</p>
            {artifacts.cues.map((iv) => {
              const Icon = INTERVENTION_ICONS[iv.kind].icon;
              return (
                <p key={`${iv.kind}-${iv.startMin}`} className="m-0 flex items-center gap-1 text-2xs text-mist">
                  <Icon size={10} aria-hidden="true" /> {fmtMin(iv.startMin)}
                </p>
              );
            })}
          </div>
          <div className="rounded-lg border border-line px-2.5 py-2">
            <p className="m-0 font-mono2 text-2xs text-dim">the payoff</p>
            <p className="m-0 text-sm font-bold text-paper">
              {(artifacts.cov.achievedMin / 60).toFixed(1)}h banked
            </p>
            <p className="m-0 text-2xs text-dim">
              of {(artifacts.cov.requiredMin / 60).toFixed(1)}h needed · example
            </p>
          </div>
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
          {/* Live solver preview — computed as the route resolves, so the
              landing reacts rather than promises. */}
          {preview && (
            <p className="mt-2.5 text-2xs text-mist" aria-live="polite">
              {(preview.shift / 60).toFixed(1)}h to move ·
              lands {preview.covPct}% adapted
              {preview.lightStart !== undefined && ` · first light ${fmtMin(preview.lightStart)}`}
            </p>
          )}
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
