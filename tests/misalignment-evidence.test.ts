import { describe, expect, test } from "bun:test";
import {
  circularDistanceMin,
  circularSignedDiffMin,
  computeTripTrajectory,
  recommendDirectionStrategy,
  shiftBetweenTimezonesOnDates,
  sleepMidpointMin,
} from "../src/domain/misalignment";
import {
  EVIDENCE_SEED_TABLE,
  VERIFIED_CITATIONS,
  getEvidenceForKind,
  getMascotCopy,
} from "../src/domain/evidence";
import { buildShiftWeekPlan, POST_SHIFT_DRIVING_WARNING } from "../src/domain/shift-work";
import { solveDay } from "../src/domain/solver";
import { ADHERENCE_PROFILE, CALENDAR, DEMO_TRIP, GARMIN_BASELINE, buildTrip } from "../src/domain/fixtures";

describe("Circular time & misalignment across midnight and 25 Oct clock change", () => {
  test("circularDistanceMin and circularSignedDiffMin wrap cleanly across midnight", () => {
    // 23:15 (1395) to 00:45 (45) is +90 minutes (1.5h), not 1350 minutes
    expect(circularSignedDiffMin(45, 1395)).toBe(90);
    expect(circularSignedDiffMin(1395, 45)).toBe(-90);
    expect(circularDistanceMin(1395, 45)).toBe(90);

    // Sleep midpoint from 23:00 (1380) to 07:00 (420) is 03:00 (180)
    expect(sleepMidpointMin(23 * 60, 7 * 60)).toBe(3 * 60);
  });

  test("handles 25 Oct 2026 UK clock change (BST UTC+1 -> GMT UTC+0) accurately", () => {
    // Before 25 Oct 2026: London is UTC+1 (60m), Tokyo is UTC+9 (540m) -> 8h east (-480m)
    const beforeDst = shiftBetweenTimezonesOnDates(
      "Europe/London",
      "2026-10-18",
      "Asia/Tokyo",
      "2026-10-18",
    );
    expect(beforeDst.originOffsetMin).toBe(60);
    expect(beforeDst.destOffsetMin).toBe(540);
    expect(beforeDst.requiredShiftMin).toBe(-480);
    expect(beforeDst.hoursAbs).toBe(8);

    // On/After 25 Oct 2026: London is UTC+0 (0m), Tokyo is UTC+9 (540m) -> 9h east (-540m)
    const afterDst = shiftBetweenTimezonesOnDates(
      "Europe/London",
      "2026-10-25",
      "Asia/Tokyo",
      "2026-10-25",
    );
    expect(afterDst.originOffsetMin).toBe(0);
    expect(afterDst.destOffsetMin).toBe(540);
    expect(afterDst.requiredShiftMin).toBe(-540);
    expect(afterDst.hoursAbs).toBe(9);

    // A trip whose D-3 starts on/after 25 Oct (e.g. departure 2026-10-28) is 9h (-540m)
    const postDstTrip = buildTrip("LHR", "HND", "2026-10-28");
    expect(postDstTrip.requiredShiftMin).toBe(-540);
  });

  test("computeTripTrajectory produces uncertainty bands and bounded skip projections", () => {
    const baseTraj = computeTripTrajectory({
      trip: DEMO_TRIP,
      days: [],
      baseline: GARMIN_BASELINE,
      calendar: CALENDAR,
    });
    expect(baseTraj).toHaveLength(5);
    expect(baseTraj[0].uncertaintyHalfWidthMin).toBeGreaterThanOrEqual(40);
    expect(baseTraj[0].misalignmentHighHours).toBeGreaterThan(baseTraj[0].misalignmentLowHours);
    expect(baseTraj[0].misalignmentHours).toBeLessThanOrEqual(baseTraj[0].baselineMisalignmentHours);

    // Skipping a day's action slips projection toward baseline, never worse than baseline
    const skippedTraj = computeTripTrajectory({
      trip: DEMO_TRIP,
      days: [],
      baseline: GARMIN_BASELINE,
      calendar: CALENDAR,
      skippedDayIndices: new Set([0, 1]),
      alcoholDayIndices: new Set([0]),
    });
    expect(skippedTraj[1].misalignmentHours).toBeGreaterThan(baseTraj[1].misalignmentHours);
    expect(skippedTraj[1].misalignmentHours).toBeLessThanOrEqual(skippedTraj[1].baselineMisalignmentHours);
    // Alcohol widens uncertainty band
    expect(skippedTraj[0].uncertaintyHalfWidthMin).toBeGreaterThan(baseTraj[0].uncertaintyHalfWidthMin);
  });

  test("recommendDirectionStrategy explains advance vs delay for >=8h eastward trip", () => {
    const strat = recommendDirectionStrategy(DEMO_TRIP, "neutral");
    expect(strat.recommendedDirection).toBe("advance");
    expect(strat.timeZoneDiffHours).toBe(8);
    expect(strat.whyThisDirection).toContain("Eastman");
  });
});

describe("Evidence Seed Table & Scientific Honesty", () => {
  test("classifies two channels and supplies two-part grades from the seed table", () => {
    const light = getEvidenceForKind("light_exposure");
    expect(light.channel).toBe("moves_clock");
    expect(light.mechanismGrade).toBe("Strong");
    expect(light.fieldGrade).toBe("Uncertain");

    const sleep = getEvidenceForKind("sleep_window");
    expect(sleep.channel).toBe("moves_clock");
    expect(sleep.mechanismGrade).toBe("Moderate");
    expect(sleep.fieldGrade).toBe("Uncertain");

    const caf = getEvidenceForKind("caffeine_cutoff");
    expect(caf.channel).toBe("helps_feel_better");
    expect(caf.mechanismGrade).toBe("Counters sleepiness");

    const ex = getEvidenceForKind("exercise");
    expect(ex.channel).toBe("helps_feel_better");
    expect(ex.mechanismGrade).toBe("Limited");

    const unknown = getEvidenceForKind("unlisted_intervention");
    expect(unknown.mechanismGrade).toBe("Unknown");
    expect(unknown.fieldGrade).toBe("Limited");
  });

  test("verified citations include Eastman & Burgess (2009), Eastman (2005), Bin (2019), and AASM", () => {
    const titles = VERIFIED_CITATIONS.map((c) => c.title).join(" ");
    expect(titles).toContain("Eastman & Burgess, 2009");
    expect(titles).toContain("Eastman et al., 2005");
    expect(titles).toContain("Bin, Postnova & Cistulli, 2019");
    expect(titles).toContain("AASM");
  });

  test("solver never emits melatonin interventions", () => {
    const solved = solveDay({
      trip: DEMO_TRIP,
      spec: DEMO_TRIP.days[0],
      lockedDays: [],
      calendar: CALENDAR,
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    expect(solved).not.toBeNull();
    expect(solved!.plan.interventions.some((iv) => iv.kind === "melatonin")).toBe(false);
  });

  test("mascot never jokes on safety-critical post-shift warnings", () => {
    const line = getMascotCopy({
      tone: "cheeky",
      state: "serious",
      misalignmentHours: 4.5,
      baselineMisalignmentHours: 6.0,
      isShiftPostNightWarning: true,
    });
    expect(line).toContain("Post-night-shift drowsiness");
  });
});

describe("SHIFT Mode 7-day rotating night-shift + childcare model", () => {
  test("adapts Thursday daytime sleep when negotiable 15:30 school pickup changes", () => {
    const weekDefault = buildShiftWeekPlan({ partnerCoversAfternoonPickup: false });
    const weekAdapted = buildShiftWeekPlan({ partnerCoversAfternoonPickup: true });

    expect(weekDefault).toHaveLength(7);
    const thuDefault = weekDefault[3];
    const thuAdapted = weekAdapted[3];

    expect(thuDefault.plannedSleepEndMin).toBe(15 * 60); // 15:00
    expect(thuAdapted.plannedSleepEndMin).toBe(16 * 60 + 15); // 16:15 (+75m)
    expect(thuAdapted.misalignmentHours).toBeLessThan(thuDefault.misalignmentHours);
    expect(thuDefault.postShiftSafetyWarning).toBe(POST_SHIFT_DRIVING_WARNING);
  });
});
