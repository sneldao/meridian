import { describe, expect, test } from "bun:test";
import { arrivalRead } from "../src/domain/arrival";
import {
  arrivalPassport,
  passportDate,
  passportText,
} from "../src/domain/arrival-passport";
import { arrivalPassportSvg } from "../src/lib/arrival-passport-svg";
import {
  ADHERENCE_PROFILE,
  buildTrip,
  CALENDAR,
  GARMIN_BASELINE,
} from "../src/domain/fixtures";
import { solveDay } from "../src/domain/solver";
import type { CheckIn, DayPlan, ShiftCoverage } from "../src/domain/types";

// The passport is the arrival screen's shareable artifact, so it is bound by
// the same contract as every number on that screen: stamp only what the read
// carries, and refuse to exist rather than invent a figure.

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

const trip = buildTrip("LHR", "HND", "2026-10-20");
const now = new Date("2026-10-22T01:00:00Z");

describe("passportDate", () => {
  test("formats a record date without locale drift", () => {
    expect(passportDate("2026-10-20")).toBe("20 OCT 2026");
    expect(passportDate("2026-01-05")).toBe("5 JAN 2026");
  });

  test("refuses anything that is not a calendar date", () => {
    expect(passportDate("not-a-date")).toBeNull();
    expect(passportDate("2026-13-01")).toBeNull();
  });
});

describe("arrivalPassport", () => {
  test("no promise and no projection means no passport", () => {
    const read = arrivalRead(trip, null, [], now);
    expect(arrivalPassport(read, trip)).toBeNull();
  });

  test("the route and landing date come from the trip, not the viewer", () => {
    const read = arrivalRead(trip, planFor(coverage()), [], now);
    const pp = arrivalPassport(read, trip);
    expect(pp).not.toBeNull();
    expect(pp!.route).toBe("LONDON → TOKYO");
    // D+1 of a 2026-10-20 departure is the 21st — the destination day.
    expect(pp!.landedOn).toBe("21 OCT 2026");
  });

  test("a gate promise stamps the banked percentage with its residual", () => {
    const read = arrivalRead(trip, planFor(coverage()), [], now);
    const pp = arrivalPassport(read, trip)!;
    expect(pp.stat).toBe("63%");
    expect(pp.statLabel).toContain("banked");
    expect(pp.stampDetail).toContain("3.0h still owed");
    expect(pp.stamp).toBe("ALMOST"); // 62.5% banked, residual > 0
  });

  test("a fully banked shift stamps ADJUSTED, not a residual", () => {
    const read = arrivalRead(
      trip,
      planFor(coverage({ complete: true, residualMin: 0, ratio: 1, achievedMin: 480 })),
      [],
      now,
    );
    const pp = arrivalPassport(read, trip)!;
    expect(pp.stamp).toBe("ADJUSTED");
    expect(pp.stat).toBe("100%");
    expect(pp.stampDetail).toContain("fully banked");
  });

  test("a barely-banked shift stamps OWED", () => {
    const read = arrivalRead(
      trip,
      planFor(coverage({ achievedMin: 60, residualMin: 420, ratio: 0.125 })),
      [],
      now,
    );
    const pp = arrivalPassport(read, trip)!;
    expect(pp.stamp).toBe("OWED");
    expect(pp.stampDetail).toContain("7.0h still owed");
  });

  test("a projection outranks the gate promise — the model stamps, not the claim", () => {
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
    const planRaw = JSON.stringify({
      summary: "s",
      score: 0.8,
      coverage: coverage(),
      days: solved(),
      baseline: GARMIN_BASELINE,
      savedAt: "2026-10-15T00:00:00Z",
    });
    const read = arrivalRead(trip, planRaw, [], now, GARMIN_BASELINE);
    expect(read.projection).not.toBeNull();
    const pp = arrivalPassport(read, trip)!;
    // The headline is the modelled body clock, not the 63% the gate claimed.
    expect(pp.statLabel).toContain("body clock at landing");
    expect(pp.statSub).toContain("doing nothing would have left");
    expect(pp.stat).toMatch(/^\d+\.\dh$/);
    // Stamp follows the same residual: a sub-hour gap is adjusted, never better.
    const hours = parseFloat(pp.stat);
    if (hours <= 1.05) expect(pp.stamp).toBe("ADJUSTED");
    else if (hours <= 3) expect(pp.stamp).toBe("ALMOST");
    else expect(pp.stamp).toBe("OWED");
  });

  test("marks appear only when marks exist", () => {
    const silent = arrivalRead(trip, planFor(coverage()), [], now);
    expect(arrivalPassport(silent, trip)!.marksLine).toBeNull();

    const marked = arrivalRead(
      trip,
      planFor(coverage()),
      [mark(0, "done"), mark(1, "partial"), mark(2, "skipped")],
      now,
    );
    expect(arrivalPassport(marked, trip)!.marksLine).toBe("1 followed · 1 partial · 1 missed");
  });
});

describe("passportText", () => {
  test("carries the record, the stamp, and the honesty footers", () => {
    const read = arrivalRead(trip, planFor(coverage()), [], now);
    const text = passportText(arrivalPassport(read, trip)!);
    expect(text).toContain("ARRIVAL RECORD");
    expect(text).toContain("LONDON → TOKYO");
    expect(text).toContain("ALMOST");
    expect(text).toContain("63%");
    expect(text).toContain("not medical advice");
  });
});

describe("arrivalPassportSvg (the exported twin)", () => {
  const pp = arrivalPassport(
    arrivalRead(trip, planFor(coverage()), [], now),
    trip,
  )!;

  test("carries the same record the card shows", () => {
    const svg = arrivalPassportSvg(pp);
    expect(svg).toContain("MERIDIAN · ARRIVAL RECORD");
    expect(svg).toContain("LONDON → TOKYO");
    expect(svg).toContain("ALMOST");
    expect(svg).toContain("63%");
    expect(svg).toContain("TIMING GUIDANCE, NOT MEDICAL ADVICE");
  });

  test("escapes whatever it is handed — the SVG is an export surface", () => {
    const hostile = { ...pp, route: '<script>alert("x")</script>' };
    const svg = arrivalPassportSvg(hostile);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });
});
