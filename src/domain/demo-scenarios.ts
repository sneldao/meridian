import { ADHERENCE_PROFILE, GARMIN_BASELINE, buildTrip, calendarFor } from "@/domain/fixtures";
import { solveDay } from "@/domain/solver";
import { performanceMoment } from "@/domain/trip-performance";
import type { CalendarEvent, DayPlan } from "@/domain/types";

export const DEMO_SCENARIOS = [
  {
    id: "jason",
    name: "Jason Calacanis",
    shortName: "Jason",
    role: "The Investor Sprint",
    title: "Be there for the big decision.",
    moment: "Investment meeting",
    startMin: 960,
    endMin: 1020,
    joke: "Jet-lagged is not an investment thesis.",
    profile: "luke",
  },
  {
    id: "cedric",
    name: "Cedric the Entertainer",
    shortName: "Cedric",
    role: "The Show Must Go On",
    title: "Save something for the spotlight.",
    moment: "Evening performance",
    startMin: 1200,
    endMin: 1290,
    joke: "The audience should be crying with laughter. Not you, from the red-eye.",
    profile: "bjork",
  },
  {
    id: "alex",
    name: "Alex Elias",
    shortName: "Alex",
    role: "Taste Meets Time Zones",
    title: "Bring your best ideas with you.",
    moment: "Customer keynote",
    startMin: 840,
    endMin: 900,
    joke: "An excellent taste graph. A deeply confused body clock.",
    profile: "bjork",
  },
] as const;

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
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(departureDate) ||
    new Date(`${departureDate}T00:00:00Z`).toISOString().slice(0, 10) !== departureDate
  ) throw new Error("Invalid demo departure date");
  const trip = buildTrip("LHR", "HND", departureDate);
  const morningMeeting = id === "jason" && meetingTime === "morning";
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
    scenario,
    trip,
    calendar,
    baseline,
    plans,
    event,
    moment: performanceMoment({ trip, calendar, plans, baseline }),
  };
}
