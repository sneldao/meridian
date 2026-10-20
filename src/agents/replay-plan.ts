// Plans for the recorded (replay) shift.
//
// The plan is the solver's. The live path already hands Otto a solver draft —
// "a feasible skeleton that already passed the scorer" — and the replay path
// used to keep a second, weaker planner of its own. Two planners drifted: the
// duplicate could not place a day around a fixed commitment, put an
// arrival-morning light in the wrong phase zone, and produced a weaker plan
// for the same route (the landing was 2.5h further out than the solver's).
// One planner now, and the replay path is the same shape as the live one.
//
// The drama is still scripted: the first drafts are deliberately wrong, so the
// gate's rejection and the recovery are visible. The verdicts are honest.

import { solveDay } from "@/domain/solver";
import { GARMIN_BASELINE } from "@/domain/fixtures";
import type { AdherenceProfile, CalendarEvent, Citation, DayPlan, Trip } from "@/domain/types";

const wrap = (m: number) => ((m % 1440) + 1440) % 1440;

export interface ReplayPlan {
  days: DayPlan[];
  /** Deliberately bad first drafts (by dayIndex) that make recovery visible. */
  badFirstDrafts: Map<number, DayPlan>;
  scripted: boolean;
}

export function replayPlanFor(
  trip: Trip,
  calendar: CalendarEvent[],
  citations: Citation[],
  adherence: AdherenceProfile,
  /**
   * The day to start from. A morning replan re-drafts the *remaining* days
   * against the traveller's updated profile, and the body clock it plans
   * against starts where the replan starts — reusing days drafted against the
   * full chain would judge one phase chain by another.
   */
  startDayIndex = 0,
): ReplayPlan {
  const days = solverDays(trip, calendar, citations, adherence, startDayIndex);
  // The demo route keeps its hand-written failures — the beats the recording
  // shows. Every other route gets the route-independent ones.
  const demoShape = trip.days.length === 5 && trip.departureDayIndex === 3;
  return {
    days,
    badFirstDrafts: demoShape ? scriptedBadDrafts(days) : genericBadDrafts(trip, days),
    scripted: demoShape,
  };
}

/**
 * The crew's plan, day by day, from the solver.
 *
 * The solver searches each day's shift downward until the real scorer passes
 * it, so every day here has been through the gate once already. The citations
 * are attached afterwards: the solver is deterministic and does no research,
 * but the plan still has to say which paper backs each ask, and the replay
 * path's citation set is the catalogue's.
 */
function solverDays(
  trip: Trip,
  calendar: CalendarEvent[],
  citations: Citation[],
  adherence: AdherenceProfile,
  startDayIndex: number,
): DayPlan[] {
  const out: DayPlan[] = [];
  for (const spec of trip.days.filter((d) => d.dayIndex >= startDayIndex)) {
    const solved = solveDay({
      trip,
      spec,
      lockedDays: out,
      calendar,
      adherence,
      baseline: GARMIN_BASELINE,
    });
    if (!solved) continue;
    out.push({
      ...solved.plan,
      interventions: solved.plan.interventions.map((iv) => ({
        ...iv,
        citationId: iv.citationId ?? citationFor(iv.kind, citations),
      })),
    });
  }
  return out;
}

/** Which paper backs each kind of ask, from the run's citation set. */
const CITATION_BY_KIND: Record<string, number> = {
  light_exposure: 2,
  avoid_light: 3,
  sleep_window: 1,
  caffeine_cutoff: 0,
  meal_timing: 0,
  exercise: 0,
  nap: 0,
  melatonin: 0,
};

function citationFor(kind: string, citations: Citation[]): string | undefined {
  const i = CITATION_BY_KIND[kind];
  if (i === undefined || !citations.length) return undefined;
  return citations[i % citations.length]?.id;
}

/** The original hand-written failures (calendar conflict on D-2, short sleep on D-1). */
function scriptedBadDrafts(days: DayPlan[]): Map<number, DayPlan> {
  return new Map([
    [
      1,
      {
        ...days[1],
        shiftMin: -75,
        interventions: [
          { kind: "light_exposure", startMin: 6 * 60, endMin: 7 * 60 + 45, note: "Wide morning light block." },
          { kind: "sleep_window", startMin: 22 * 60 + 25, endMin: 5 * 60 + 15, note: `Bed 22:25, up 05:15.` },
        ],
      },
    ],
    [
      2,
      {
        ...days[2],
        shiftMin: -120,
        targetBedtimeMin: 19 * 60 + 30,
        targetWakeMin: 3 * 60 + 30,
        interventions: [
          { kind: "sleep_window", startMin: 19 * 60 + 30, endMin: 3 * 60 + 30, note: "Bank the whole shift tonight." },
          { kind: "light_exposure", startMin: 3 * 60 + 45, endMin: 4 * 60 + 45, note: "Wake anchor." },
        ],
      },
    ],
  ]);
}

/** Route-independent failures: too fast on D-2, too little sleep on D-1. */
function genericBadDrafts(trip: Trip, days: DayPlan[]): Map<number, DayPlan> {
  const sign = trip.direction === "east" ? -1 : 1;
  const bad = new Map<number, DayPlan>();
  if (days[1]) bad.set(1, { ...days[1], shiftMin: sign * 120 });
  if (days[2]) {
    const d = days[2];
    const bed = wrap(d.targetWakeMin - 5 * 60); // 5 h in bed
    bad.set(2, {
      ...d,
      targetBedtimeMin: bed,
      interventions: d.interventions.map((iv) =>
        iv.kind === "sleep_window" ? { ...iv, startMin: bed, note: "Compress the night to force the shift." } : iv,
      ),
    });
  }
  return bad;
}
