import { arrivalRead } from "./arrival";
import { arrivalPassport, type ArrivalPassport } from "./arrival-passport";
import type { ArrivalRead } from "./arrival";
import { buildDemoScenario, DEMO_SCENARIOS, type DemoScenarioId } from "./demo-scenarios";
import type { HeroMeeting } from "./hero";
import type { InterventionKind } from "./types";
import type { DayPlan, Trip, WearableBaseline } from "./types";
import { INTERVENTION_LABELS } from "@/lib/intervention-icons";

/** The demo journey as data (round 19).
 *
 *  The `/demo` beat engine renders from this module and nothing else: every
 *  number on screen is computed here by the same domain functions the live
 *  app uses (buildDemoScenario → solver, arrivalRead, arrivalPassport), so
 *  the demo can never tell a story the product cannot back up. The beats
 *  themselves — stakes, crew, plan, payoff — are the journey spine the IA
 *  already promises, told in order instead of all at once. */

export interface DemoJourney {
  scenarioId: DemoScenarioId;
  scenario: (typeof DEMO_SCENARIOS)[number];
  trip: Trip;
  plans: DayPlan[];
  baseline: WearableBaseline;
  /** The fictional moment that matters, with both clock readings. */
  moment: HeroMeeting;
  /** The arrival morning's honest read, computed against the solved plan. */
  read: ArrivalRead;
  /** The stamped record — or null, exactly as on /arrival. */
  passport: ArrivalPassport | null;
}

export const DEMO_BEAT_IDS = ["stakes", "crew", "plan", "payoff"] as const;
export type DemoBeatId = (typeof DEMO_BEAT_IDS)[number];

export const DEMO_BEAT_TITLES: Record<DemoBeatId, string> = {
  stakes: "The stakes",
  crew: "The crew at work",
  plan: "The plan",
  payoff: "The payoff",
};

/** The example route's departure date — the same fixed week the landing's
 *  headline and the high-stakes days use, so the story never changes under
 *  the visitor. */
export const DEMO_DEPARTURE_DATE = "2026-11-03";

export function demoJourney(scenarioId: DemoScenarioId = "jason"): DemoJourney {
  const { scenario, trip, baseline, plans, moment } = buildDemoScenario(
    scenarioId,
    DEMO_DEPARTURE_DATE,
  );
  if (!moment) throw new Error("demo scenario has no moment to protect");
  // The read happens on the arrival morning at the destination: the trip's
  // arrival day at local noon, expressed as UTC via the destination offset so
  // arrivalRead's "arrived" logic lands on the right side of midnight.
  const arrivalSpec = trip.days.find((d) => d.dayIndex === trip.departureDayIndex + 1);
  const noonLocal = 12 * 60;
  const now = arrivalSpec?.date
    ? new Date(
        Date.parse(`${arrivalSpec.date}T00:00:00Z`) +
          (noonLocal - trip.destination.utcOffsetMin) * 60000,
      )
    : new Date();
  const planRaw = JSON.stringify({
    summary: `Example plan · ${trip.origin.code} → ${trip.destination.code}`,
    score: null,
    days: plans,
    baseline,
  });
  const read = arrivalRead(trip, planRaw, [], now, baseline);
  return {
    scenarioId,
    scenario,
    trip,
    plans,
    baseline,
    moment,
    read,
    passport: arrivalPassport(read, trip),
  };
}

/** The gap the stakes beat headlines: how far the moment sits from a body
 *  that never adjusted, in hours (one decimal). */
export function stakesGapHours(moment: HeroMeeting): number {
  const diffMin = Math.abs(((moment.localMin - moment.bodyWithoutPlanMin) % 1440 + 1440) % 1440);
  const wrapped = Math.min(diffMin, 1440 - diffMin);
  return Math.round((wrapped / 60) * 10) / 10;
}

/** Minutes-of-day → "HH:MM". */
export function clockLabel(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** The plan beat's rows: the arrival day's interventions in clock order,
 *  each with the crew's own note. */
export interface DemoPlanRow {
  id: string;
  kind: string;
  label: string;
  time: string;
  note: string;
}

export function planRows(journey: DemoJourney): DemoPlanRow[] {
  const day = journey.plans.find(
    (d) => d.dayIndex === journey.trip.departureDayIndex + 1,
  );
  if (!day) return [];
  return [...day.interventions]
    .sort((a, b) => a.startMin - b.startMin)
    .map((iv, i) => ({
      id: `${day.label}-${i}`,
      kind: iv.kind,
      // The traveller-facing vocabulary is owned by intervention-icons — the
      // demo never invents its own words for the same asks.
      label: INTERVENTION_LABELS[iv.kind as InterventionKind] ?? iv.kind,
      time: clockLabel(iv.startMin),
      note: iv.note,
    }));
}

/** Every scenario, for the picker the demo's footer offers. */
export const demoScenarios = DEMO_SCENARIOS;
