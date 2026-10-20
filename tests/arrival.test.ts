import { describe, expect, test } from "bun:test";
import {
  arrivalHeadline,
  arrivalLede,
  arrivalRead,
  landingProjection,
  readGatePromise,
  tripDebrief,
} from "../src/domain/arrival";
import { arrivalRows } from "../src/domain/arrival-rows";
import { buildTrip, GARMIN_BASELINE } from "../src/domain/fixtures";
import { solveDay } from "../src/domain/solver";
import { ADHERENCE_PROFILE, CALENDAR } from "../src/domain/fixtures";
import type { CheckIn, DayPlan, ShiftCoverage } from "../src/domain/types";

// The arrival screen is the only place the product makes a claim about the
// traveller's own trip after the fact. Everything here is about it staying
// honest — an arrival screen that flatters is worse than not having one.

const coverage = (over: Partial<ShiftCoverage> = {}): ShiftCoverage => ({
  requiredMin: 480,
  achievedMin: 300,
  residualMin: 180,
  ratio: 0.625,
  daysTotal: 9,
  daysPlanned: 4,
  complete: false,
  ...over,
});

const planFor = (c: ShiftCoverage) =>
  JSON.stringify({ summary: "s", score: 0.8, coverage: c, savedAt: "2026-10-15T00:00:00Z" });

const mark = (dayIndex: number, status: CheckIn["status"]): CheckIn => ({
  id: `c${dayIndex}-${status}`,
  dayIndex,
  status,
  at: Date.parse("2026-10-16T09:00:00Z"),
});

describe("readGatePromise", () => {
  test("reads the coverage the briefing promised", () => {
    const p = readGatePromise(planFor(coverage()));
    expect(p?.coverage.residualMin).toBe(180);
    expect(p?.coverage.requiredMin).toBe(480);
  });

  test("no plan means no promise — never a zeroed one", () => {
    expect(readGatePromise(null)).toBeNull();
    expect(readGatePromise("not json")).toBeNull();
    expect(readGatePromise("{}")).toBeNull();
  });

  test("a plan saved before coverage existed reads as no promise", () => {
    // Honest degradation: the old shape still loads, it just has nothing to
    // score against. Reporting 0 residual here would claim the crew promised
    // nothing, which is a different and wrong statement.
    const old = JSON.stringify({ summary: "s", score: 0.8, days: [] });
    expect(readGatePromise(old)).toBeNull();
  });
});

describe("arrivalRead", () => {
  const trip = buildTrip("LHR", "HND", "2026-10-20");
  const found = trip.days.find((d) => d.dayIndex === trip.departureDayIndex + 1);
  const arrivalDate = found?.date;
  if (!arrivalDate) throw new Error("fixture trip has no arrival day");

  test("not arrived on the day before touchdown", () => {
    const read = arrivalRead(trip, null, [], new Date(`${arrivalDate}T00:00:00Z`));
    expect(read.arrived).toBe(true); // arrival date midnight == arrival day
    // a day earlier is still pre-flight
    const earlier = new Date(Date.parse(`${arrivalDate}T00:00:00Z`) - 86400000);
    expect(arrivalRead(trip, null, [], earlier).arrived).toBe(false);
  });

  test("arrival is judged at the destination clock, not the viewer's", () => {
    // 23:30 UTC on the arrival date is 08:30 the next morning in Tokyo, so the
    // traveller is a day further along than a London-local reading would say.
    const read = arrivalRead(trip, null, [], new Date(`${arrivalDate}T23:30:00Z`));
    expect(read.daysSinceArrival).toBeGreaterThanOrEqual(0);
  });

  test("a trip that is over reports no days remaining", () => {
    // The regression: dividing elapsed minutes by 1440 drifts by one whenever
    // the local time of day isn't midnight, so a finished trip claimed "1 day
    // left" — the copy then read "That's the trip" and the count disagreed.
    const last = trip.days[trip.days.length - 1];
    if (!last.date) throw new Error("fixture trip has no last day");
    const later = new Date(`${last.date}T12:00:00Z`);
    later.setUTCDate(later.getUTCDate() + 1);
    const read = arrivalRead(trip, null, [], later);
    expect(read.arrived).toBe(true);
    expect(read.daysRemaining).toBe(0);
  });

  test("the last planned day still counts as remaining time", () => {
    const last = trip.days[trip.days.length - 1];
    if (!last.date) throw new Error("fixture trip has no last day");
    const read = arrivalRead(trip, null, [], new Date(`${last.date}T09:00:00Z`));
    expect(read.arrived).toBe(true);
    expect(read.daysRemaining).toBe(0);
  });

  test("counts only this trip's check-ins", () => {
    const read = arrivalRead(
      trip,
      null,
      [mark(0, "done"), mark(1, "done"), mark(1, "skipped"), mark(1, "partial"), mark(99, "skipped")],
      new Date(),
    );
    // dayIndex 99 isn't in this trip, so it must not be counted
    expect(read.followed).toBe(2);
    expect(read.missed).toBe(1);
    expect(read.partial).toBe(1);
    expect(read.followRate).toBeCloseTo(0.5, 5);
  });

  test("no marks means an unknown follow rate, not zero", () => {
    const read = arrivalRead(trip, null, [], new Date());
    expect(read.followRate).toBeNull();
    expect(read.followed).toBe(0);
  });

  test("carries the promise through", () => {
    const read = arrivalRead(trip, planFor(coverage({ complete: true, residualMin: 0 })), [], new Date());
    expect(read.promise?.coverage.complete).toBe(true);
  });

  test("days remaining never goes negative", () => {
    const read = arrivalRead(trip, null, [], new Date("2030-01-01T00:00:00Z"));
    expect(read.daysRemaining).toBe(0);
  });
});

describe("arrivalHeadline", () => {
  test("a completed shift says so plainly", () => {
    const read = arrivalRead(
      buildTrip("LHR", "HND", "2026-10-20"),
      planFor(coverage({ complete: true, residualMin: 0, ratio: 1 })),
      [],
      new Date(),
    );
    const h = arrivalHeadline(read, "Tokyo");
    expect(h).toContain("fully adapted");
    expect(h).not.toContain("still owed");
  });

  test("a partial shift states the residual, never rounds it away", () => {
    const read = arrivalRead(
      buildTrip("LHR", "HND", "2026-10-20"),
      planFor(coverage({ achievedMin: 300, residualMin: 180, ratio: 0.625 })),
      [],
      new Date(),
    );
    const h = arrivalHeadline(read, "Tokyo");
    expect(h).toContain("3h"); // 180min, not rounded to 0
    expect(h).toContain("63%"); // 62.5 -> 63, and the residual is still stated
    expect(h).toContain("Tokyo");
  });

  test("no promise means the screen says so rather than inventing one", () => {
    const read = arrivalRead(buildTrip("LHR", "HND", "2026-10-20"), null, [], new Date());
    const h = arrivalHeadline(read, "Tokyo");
    expect(h).toContain("wasn't saved");
  });
});

describe("tripDebrief (bet 4 — retention made navigable)", () => {
  const trip = buildTrip("LHR", "HND", "2026-10-20");
  const done = (kind: CheckIn["kind"], dayIndex = 0): CheckIn => ({
    id: `d-${kind}-${dayIndex}`,
    dayIndex,
    kind,
    status: "done",
    at: Date.parse("2026-10-22T09:00:00Z"),
  });

  const readFor = (checkIns: CheckIn[] = []) =>
    arrivalRead(trip, planFor(coverage()), checkIns, new Date("2026-10-25T00:00:00Z"));

  test("names the gate score, follow-through, and top lesson", () => {
    const out = tripDebrief(
      readFor([done("light_exposure", 0), done("light_exposure", 1), done("exercise", 2)]),
      "Tokyo",
      [done("light_exposure", 0), done("light_exposure", 1), done("exercise", 2)],
      { origin: "LHR", destination: "HND" },
      [],
    );
    expect(out.gateScore).toBe(0.8);
    expect(out.lesson).not.toBeNull();
    expect(out.lesson!.label).toBe("light exposure");
    expect(out.carriedFrom).toBeNull();
  });

  test("no done marks means no lesson — never generic praise", () => {
    const out = tripDebrief(readFor([]), "Tokyo", [], { origin: "LHR", destination: "HND" }, []);
    expect(out.lesson).toBeNull();
    expect(out.followRate).toBeNull();
  });

  test("names the prior different-route trip as carried-in proof", () => {
    const out = tripDebrief(
      readFor([]),
      "Tokyo",
      [],
      { origin: "LHR", destination: "HND" },
      [{ trip: { origin: { code: "JFK" }, destination: { code: "SFO" } } }],
    );
    expect(out.carriedFrom).toBe("JFK → SFO");
  });

  test("same-route and corrupt rows never become carried-in proof", () => {
    const out = tripDebrief(
      readFor([]),
      "Tokyo",
      [],
      { origin: "LHR", destination: "HND" },
      [
        { trip: { origin: { code: "LHR" }, destination: { code: "HND" } } },
        { trip: null },
        {},
      ],
    );
    expect(out.carriedFrom).toBeNull();
  });
});

// The loop: the clock shows what the body clock will be, and the landing has
// to say the same thing. Before this, the arrival page repeated the plan's
// *claim* back at the traveller, which is the one number the model exists to
// distrust.

describe("landingProjection", () => {
  const trip = buildTrip("LHR", "HND", "2026-10-18");

  const planWithDays = (days: DayPlan[], c: ShiftCoverage = coverage()) =>
    JSON.stringify({
      summary: "s",
      score: 0.8,
      coverage: c,
      days,
      baseline: GARMIN_BASELINE,
      savedAt: "2026-10-18T00:00:00Z",
    });

  const solved = (): DayPlan[] => {
    const out: DayPlan[] = [];
    for (const spec of trip.days) {
      const r = solveDay({
        trip,
        spec,
        lockedDays: out,
        calendar: CALENDAR,
        adherence: ADHERENCE_PROFILE,
        baseline: GARMIN_BASELINE,
      });
      if (r) out.push(r.plan);
    }
    return out;
  };

  test("says what the body clock will be, not what the plan claimed", () => {
    const p = landingProjection(trip, planWithDays(solved()), GARMIN_BASELINE);
    expect(p).not.toBeNull();
    // The claim is the plan's own declared shift, measured up to the landing
    // day so it is comparable with the delivery measured at that moment:
    // 90 minutes on D-3 and 90 on the arrival day.
    expect(p!.claimedHours).toBe(3);
    // The delivery is the model's answer for the same window, and it is
    // bounded by the whole shift either way.
    expect(p!.deliveredHours).toBeGreaterThan(0);
    expect(p!.deliveredHours).toBeLessThanOrEqual(p!.requiredHours);
    // The model delivers what the timing supports, which can be more than the
    // plan claimed: a plan that declares less than its own cues carry is
    // conservative, not broken — and the landing reports the difference
    // rather than hiding it.
    expect(p!.requiredHours).toBe(8);
    expect(p!.hours).toBeGreaterThan(0);
    expect(p!.lowHours).toBeLessThanOrEqual(p!.hours);
    expect(p!.highHours).toBeGreaterThanOrEqual(p!.hours);
  });

  test("doing nothing is worse than the plan, when the plan is a plan", () => {
    const p = landingProjection(trip, planWithDays(solved()), GARMIN_BASELINE);
    expect(p!.baselineHours).toBeGreaterThan(p!.hours);
  });

  test("no plan, or no baseline, means no projection — never a zeroed one", () => {
    expect(landingProjection(trip, null, GARMIN_BASELINE)).toBeNull();
    expect(landingProjection(trip, planWithDays(solved()), undefined)).toBeNull();
    expect(landingProjection(trip, "not json", GARMIN_BASELINE)).toBeNull();
    // A plan with no days cannot be projected either.
    expect(landingProjection(trip, planWithDays([]), GARMIN_BASELINE)).toBeNull();
  });

  test("the headline is one sentence and the rest is the lede", () => {
    const days = solved();
    const read = arrivalRead(
      trip,
      planWithDays(days),
      [],
      new Date("2026-10-25T00:00:00Z"),
      GARMIN_BASELINE,
    );
    expect(read.projection).not.toBeNull();
    const headline = arrivalHeadline(read, "Tokyo");
    expect(headline).toContain("You landed about");
    expect(headline).toContain("Tokyo time");
    // One sentence for the headline: the payoff opens with the number, and the
    // detail is the line under it.
    expect(headline.split(". ").length).toBeLessThanOrEqual(2);
    const lede = arrivalLede(read);
    expect(lede).toContain("carried");
    expect(lede).toContain("doing nothing would have left");
  });

  test("the rows name the body clock, and the overclaim when there is one", () => {
    const days = solved();
    const read = arrivalRead(
      trip,
      planWithDays(days),
      [],
      new Date("2026-10-25T00:00:00Z"),
      GARMIN_BASELINE,
    );
    const rows = arrivalRows(read, trip, []);
    const clock = rows.find((r) => r.label === "your body clock at landing");
    expect(clock).toBeDefined();
    expect(clock!.note).toContain("doing nothing would have left");
    const shift = rows.find((r) => r.label === "the shift before you flew");
    expect(shift).toBeDefined();
    expect(shift!.value).toContain("of 8.0h");
  });
});
