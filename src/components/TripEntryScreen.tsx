"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { RoutePicker } from "@/components/RoutePicker";
import { isValidHomeRoute, type HomeRoute } from "@/lib/home-entry";
import { SampleJourneys } from "@/components/SampleJourneys";
import { SunSelf } from "@/components/SunSelf";
import type { DemoScenarioId } from "@/domain/demo-scenarios";
import { sunSelfRead, sunSelfSleeping } from "@/domain/sun-self";
import { ADHERENCE_PROFILE, buildTrip, GARMIN_BASELINE } from "@/domain/fixtures";
import { previewPlan, type SolvedDay } from "@/domain/solver";
import { routeGapHeadline, routeGapLine, routeGapRead, type RouteGapRead } from "@/domain/route-gap";
import { coverageOf, fmtMin } from "@/domain/circadian";
import type { CityCode, Trip } from "@/domain/types";

function planPreview(route: HomeRoute): { lightStart?: number; covPct: number } | null {
  try {
    const t: Trip = buildTrip(route.origin.toUpperCase() as CityCode, route.dest.toUpperCase() as CityCode, route.date);
    // Same demo baseline as the tiles above: a preview the solver can
    // actually place, computed the moment the route resolves.
    const solved = previewPlan({ trip: t, calendar: [], adherence: ADHERENCE_PROFILE, baseline: GARMIN_BASELINE });
    const days = [...solved.values()].filter((s): s is SolvedDay => !!s).map((s) => s.plan);
    if (!days.length) return null;
    const light = days.flatMap((d) => d.interventions).find((i) => i.kind === "light_exposure");
    return {
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
  /** The resolved gap + solver coverage for the draft, reported as it
   *  changes — the landing stage plays the visitor's own route (round 30
   *  phase 3). Null gap = the draft hasn't resolved. */
  onGapChange?: (gap: RouteGapRead | null, covPct: number | null) => void;
}

export function TripEntryScreen({ initialDate, onContinue, onExploreExample, onExploreScenario, initialRoute, onGapChange }: TripEntryScreenProps) {
  const [draft, setDraft] = useState<HomeRoute>(
    initialRoute && isValidHomeRoute(initialRoute) ? initialRoute : { origin: "", dest: "", date: initialDate },
  );
  const valid = isValidHomeRoute(draft);
  const sameAirports =
    !!draft.origin && !!draft.dest && draft.origin.toUpperCase() === draft.dest.toUpperCase();
  const preview = useMemo(() => (valid ? planPreview(draft) : null), [draft, valid]);
  // The stakes line, computed from the route being typed — the headline
  // reacts the moment the draft resolves, not after the form is submitted.
  const gap = useMemo(() => (valid ? routeGapRead(draft) : null), [draft, valid]);
  // Report the resolved read upward — the landing stage adopts it.
  useEffect(() => {
    onGapChange?.(gap, preview?.covPct ?? null);
  }, [gap, preview, onGapChange]);

  // The face wakes as the route is typed (round 25): asleep while the draft
  // is empty — no route yet means no debt yet — and the moment the draft
  // resolves it shows exactly what the headline says: the gap the route
  // carries, owed in full, nothing banked. The pulse fires once, on waking.
  const entrySun = gap
    ? sunSelfRead({
        owedMin: gap.gapMin,
        deliveredMin: 0,
        requiredMin: gap.gapMin,
        direction: gap.direction,
      })
    : sunSelfSleeping();

  return (
    <div className="reading entry" id="trip-entry" role="group" aria-labelledby="entry-heading">
      <div className="entry-intro">
        {/* The brand's face — asleep before the route resolves, awake (and
            honest about the debt) the moment it does. */}
        <div className="entry-sunself">
          <SunSelf read={entrySun} size={56} pulseKey={gap ? "awake" : null} />
        </div>
        <p className="entry-eyebrow">Arrive with a plan</p>
        {/* Round 30: the stage above already told the demo journey — the
            pain line is not restated here. Once the draft resolves the
            headline names *their* gap instead. */}
        <h1 id="entry-heading" className="entry-title">
          {gap ? routeGapHeadline(gap) : "Your turn."}
        </h1>
        {/* The hero above already said what the plan does; this line says
            who does the work — the division of labour is the new fact. */}
        <p className="entry-sub">Your crew reads the route, drafts the days, and hands back a plan you keep.</p>
        <p className="entry-source">Sleep timing from your trip. Place discovery powered by Qloo when available.</p>
      </div>
      <div className="entry-planner">
        {/* One "start" per page: the hero's CTA already said it — the
            form's own header carries this block. */}
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
              landing reacts rather than promises. The gap read lands the
              moment the airports resolve; the solver's line follows. */}
          {(preview || gap) && (
            <p className="mt-2.5 text-2xs text-mist" aria-live="polite">
              {gap && (
                <>
                  {routeGapLine(gap)}
                  {preview ? " · " : ""}
                </>
              )}
              {preview && (
                <>
                  lands {preview.covPct}% adapted
                  {preview.lightStart !== undefined && ` · first light ${fmtMin(preview.lightStart)}`}
                </>
              )}
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
