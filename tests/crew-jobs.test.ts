import { describe, expect, test } from "bun:test";
import { deriveCrewJobs, buildCrewJobFacts } from "../src/lib/crew-jobs";
import type { CrewEvent, DayPlan, Trip } from "../src/domain/types";
import { buildTrip, calendarFor, ADHERENCE_PROFILE, GARMIN_BASELINE } from "../src/domain/fixtures";
import { previewPlan } from "../src/domain/solver";
import fixture from "../src/state/fixture-events.json";
import type { StampedEvent } from "../src/state/run";

/* TaskRows (agent-native step 5): the jobs' statuses and counts must be
 * real — quoted from the event log, the solver preview or the saved
 * itinerary — never invented progress and never a staged failure. */

const fixtureEvents = (fixture as unknown as { events: StampedEvent[] }).events.map(
  (e) => e.event,
);
const doneRun = fixtureEvents.filter((e) => e.type !== "agent_token");

const job = (jobs: ReturnType<typeof deriveCrewJobs>["jobs"], id: string) =>
  jobs.find((j) => j.id === id)!;

const TRIP = buildTrip("LHR", "HND", "2026-10-18");

const factsFor = (trip: Trip) =>
  buildCrewJobFacts({
    trip,
    solved: previewPlan({
      trip,
      calendar: calendarFor(trip),
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    }),
    calendar: calendarFor(trip),
    adherence: ADHERENCE_PROFILE,
    baseline: GARMIN_BASELINE,
    favorites: [],
  });

describe("crew jobs — run evidence", () => {
  test("a finished run settles every job with real counts", () => {
    const { jobs } = deriveCrewJobs({
      phase: "done",
      events: doneRun,
      facts: factsFor(TRIP),
      canRetry: true,
    });
    expect(jobs.map((j) => j.id)).toEqual([
      "baseline",
      "papers",
      "plan",
      "conflicts",
      "calendar",
      "places",
    ]);
    // The fixture run locked 5 days, kept 4 papers, moved 3 events —
    // counts come from the log, not fixtures in the component.
    expect(job(jobs, "papers").count).toBe("4 papers");
    expect(job(jobs, "plan").status).toBe("completed");
    expect(job(jobs, "plan").count).toContain("windows scheduled");
    expect(job(jobs, "conflicts").count).toContain("checks");
    expect(job(jobs, "calendar").count).toBe("3 moves");
    // No itinerary in this run and no crate — the scout says so plainly.
    expect(job(jobs, "places").count).toBe("no crate packed");
    expect(job(jobs, "places").status).toBe("completed");
    // Otto's detail quotes the days that actually locked.
    expect(
      job(jobs, "plan").steps.some((s) => s.text.includes("locked")),
    ).toBe(true);
  });

  test("running shows only while the stage is genuinely in flight", () => {
    // Mid-run: analyst done, planner's loop open.
    const cut = doneRun.findIndex((e) => e.type === "agent_start" && e.agent === "planner");
    const mid = doneRun.slice(0, cut + 1);
    const { jobs } = deriveCrewJobs({
      phase: "running",
      events: mid,
      activeAgent: "planner",
      canRetry: false,
    });
    expect(job(jobs, "baseline").status).toBe("completed");
    // Jun's turn closes before the planner loop opens — completed is real.
    expect(job(jobs, "papers").status).toBe("completed");
    expect(job(jobs, "papers").count).toBe("4 papers");
    expect(job(jobs, "plan").status).toBe("running");
    expect(job(jobs, "conflicts").status).toBe("queued");
    expect(job(jobs, "calendar").status).toBe("queued");
    // canRetry:false — a retry affordance must not appear mid-flight.
    expect(jobs.every((j) => !j.canRetry)).toBe(true);
  });

  test("a failed calendar job is reachable only from real events", () => {
    const events: CrewEvent[] = [
      ...doneRun.slice(0, -2),
      { type: "calendar_restore", calendar: [] },
      {
        type: "error",
        message: "Calendar rescheduling broke the locked plan — reverted.",
        recoverable: true,
      },
      { type: "done" },
    ];
    const { jobs } = deriveCrewJobs({
      phase: "done",
      events,
      canRetry: true,
    });
    const cal = job(jobs, "calendar");
    expect(cal.status).toBe("failed");
    expect(cal.canRetry).toBe(true);
    expect(cal.steps.some((s) => s.tone === "fail")).toBe(true);
  });

  test("a dead stream fails the job that held the baton, with the real error", () => {
    const { jobs } = deriveCrewJobs({
      phase: "idle",
      events: [],
      lastActiveAgent: "evaluator",
      runError: "The crew stopped responding mid-run.",
      facts: factsFor(TRIP),
      canRetry: true,
    });
    const iris = job(jobs, "conflicts");
    expect(iris.status).toBe("failed");
    expect(iris.canRetry).toBe(true);
    expect(iris.steps.some((s) => s.text.includes("stopped responding"))).toBe(true);
    // The others keep their honest preview state — nothing invented.
    expect(job(jobs, "plan").source).toBe("preview");
  });
});

describe("crew jobs — preview evidence", () => {
  test("no run: solver facts become Preview rows with real numbers", () => {
    const { jobs } = deriveCrewJobs({
      phase: "idle",
      events: [],
      facts: factsFor(TRIP),
      canRetry: false,
    });
    const otto = job(jobs, "plan");
    expect(otto.status).toBe("completed");
    expect(otto.source).toBe("preview");
    expect(otto.count).toContain("windows scheduled");
    const iris = job(jobs, "conflicts");
    expect(iris.status).toBe("completed");
    expect(iris.source).toBe("preview");
    // No run ever pulled papers or touched the calendar — queued, not faked.
    expect(job(jobs, "papers").status).toBe("queued");
    expect(job(jobs, "calendar").status).toBe("queued");
    expect(job(jobs, "places").status).toBe("queued");
  });

  test("no run, no trip facts: every job is queued", () => {
    const { jobs } = deriveCrewJobs({ phase: "idle", events: [] });
    expect(jobs.every((j) => j.status === "queued")).toBe(true);
  });

  test("an unavailable place lookup is a real Failed, not a staged one", () => {
    const unavailable: CrewEvent[] = [
      ...doneRun.slice(0, -1),
      {
        type: "briefing",
        summary: "s",
        ics: "",
        score: 0.9,
        citations: [],
        days: [],
        coverage: {
          requiredMin: 480,
          achievedMin: 380,
          residualMin: 100,
          ratio: 0.79,
          daysTotal: 5,
          daysPlanned: 5,
          complete: false,
        },
        tasteItinerary: {
          destinationCode: "HND",
          destination: "Tokyo",
          departureDate: "2026-10-21",
          favorites: [],
          status: "unavailable",
          planningMode: "live",
          suggestions: [],
        },
      },
      { type: "done" },
    ];
    const { jobs } = deriveCrewJobs({ phase: "done", events: unavailable, canRetry: true });
    const scout = job(jobs, "places");
    expect(scout.status).toBe("failed");
    expect(scout.canRetry).toBe(true);
  });
});

describe("crew jobs — facts builder", () => {
  test("locked days outrank the solver preview", () => {
    const locked: DayPlan[] = [
      {
        dayIndex: 0,
        label: "D-3",
        shiftMin: -90,
        targetBedtimeMin: 1345,
        targetWakeMin: 315,
        interventions: [
          { kind: "light_exposure", startMin: 420, endMin: 480, note: "n" },
          { kind: "sleep_window", startMin: 1345, endMin: 315, note: "n" },
        ],
      },
    ];
    const facts = buildCrewJobFacts({
      trip: TRIP,
      solved: previewPlan({
        trip: TRIP,
        calendar: calendarFor(TRIP),
        adherence: ADHERENCE_PROFILE,
        baseline: GARMIN_BASELINE,
      }),
      locked,
      calendar: calendarFor(TRIP),
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
      favorites: [],
    });
    expect(facts.light?.fromLocked).toBe(true);
    expect(facts.light?.windows).toBe(2);
    expect(facts.noCrate).toBe(true);
  });
});
