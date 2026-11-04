import { ADHERENCE_PROFILE, GARMIN_BASELINE, buildTrip, calendarFor } from "@/domain/fixtures";
import { solveDay } from "@/domain/solver";
import { performanceMoment } from "@/domain/trip-performance";
import type { CalendarEvent, DayPlan } from "@/domain/types";

/** A demo persona's story. `origin`/`dest` stay optional: the founding
 *  three share the canonical LHR → HND fixture, and only a scenario that
 *  flies its own route (Diego: JFK → MEX) names one. */
export interface DemoScenarioDef {
  id: string;
  name: string;
  shortName: string;
  role: string;
  persona: string;
  title: string;
  moment: string;
  startMin: number;
  endMin: number;
  joke: string;
  /** The sample-taste profile the scenario's story is told with. */
  profile: string;
  origin?: string;
  dest?: string;
}

export const DEMO_SCENARIOS = [
  {
    id: "miles",
    name: "Miles Mercer",
    shortName: "Miles",
    role: "The Investor Sprint",
    persona: "Venture partner — one meeting that funds the year.",
    title: "Be there for the big decision.",
    moment: "Investment meeting",
    startMin: 960,
    endMin: 1020,
    joke: "Jet-lagged is not an investment thesis.",
    profile: "luke",
  },
  {
    id: "danny",
    name: "Danny Rivers",
    shortName: "Danny",
    role: "The Show Must Go On",
    persona: "Stand-up comic — an evening show at the end of a red-eye.",
    title: "Save something for the spotlight.",
    moment: "Evening performance",
    startMin: 1200,
    endMin: 1290,
    joke: "The audience should be crying with laughter. Not you, from the red-eye.",
    profile: "bjork",
  },
  {
    id: "sofia",
    name: "Sofia Marchetti",
    shortName: "Sofia",
    role: "Taste Meets Time Zones",
    persona: "Founder — customer keynote first, the food always.",
    title: "Bring your best ideas with you.",
    moment: "Customer keynote",
    startMin: 840,
    endMin: 900,
    joke: "An excellent taste graph. A deeply confused body clock.",
    profile: "bjork",
  },
  {
    id: "diego",
    name: "Diego Vidal",
    shortName: "Diego",
    role: "The Roma Norte Dispatch",
    persona: "Vinyl & art curator — a Roma Norte gallery opening the night after landing.",
    origin: "JFK",
    dest: "MEX",
    title: "Land awake. Walk straight into the opening.",
    moment: "Gallery opening",
    // 18:00–20:00: a real reception hour — and the latest window the
    // solver can still place D+1's westbound zeitgebers around (a 19:00
    // start blocks the evening light anchor and the day goes unplaced).
    startMin: 1080,
    endMin: 1200,
    joke: "It knew the mezcaleria. Before I did.",
    profile: "diego",
  },
] as const satisfies readonly DemoScenarioDef[];

export type DemoScenarioId = (typeof DEMO_SCENARIOS)[number]["id"];

export function isDemoScenarioId(value: unknown): value is DemoScenarioId {
  return DEMO_SCENARIOS.some((scenario) => scenario.id === value);
}

export function buildDemoScenario(
  id: DemoScenarioId,
  departureDate: string,
  meetingTime: "morning" | "afternoon" = "afternoon",
) {
  const scenario = DEMO_SCENARIOS.find((s) => s.id === id);
  if (!scenario) throw new Error("Unknown demo scenario");
  // Widen to the def shape so the optional route fields (Diego flies his
  // own JFK → MEX; the founding three share LHR → HND) are readable.
  const def: DemoScenarioDef = scenario;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(departureDate) ||
    new Date(`${departureDate}T00:00:00Z`).toISOString().slice(0, 10) !== departureDate
  ) throw new Error("Invalid demo departure date");
  // Scenarios fly their own route (Diego: JFK → MEX); the original three
  // share the canonical LHR → HND fixture.
  const trip = buildTrip(def.origin ?? "LHR", def.dest ?? "HND", departureDate);
  const morningMeeting = id === "miles" && meetingTime === "morning";
  const event: CalendarEvent = {
    id: `sample-${id}-moment`,
    title: scenario.moment,
    dayIndex: trip.departureDayIndex + 1,
    startMin: morningMeeting ? 600 : scenario.startMin,
    endMin: morningMeeting ? 660 : scenario.endMin,
    movable: false,
  };
  const calendar = [...calendarFor(trip).filter((e) => e.id === "ev-flight"), event];
  const baseline = { ...GARMIN_BASELINE, wearer: "Fictional demo profile" };
  const plans: DayPlan[] = [];
  for (const spec of trip.days) {
    const solved = solveDay({
      trip,
      spec,
      calendar,
      lockedDays: plans,
      baseline,
      adherence: ADHERENCE_PROFILE,
    });
    if (solved) plans.push(solved.plan);
  }
  return {
    scenario: def,
    trip,
    calendar,
    baseline,
    plans,
    event,
    moment: performanceMoment({ trip, calendar, plans, baseline }),
  };
}
