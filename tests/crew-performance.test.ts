import { describe, expect, test } from "bun:test";
import { crewPerformance } from "@/domain/crew-performance";
import { demoJourney } from "@/domain/demo-beats";
import { evaluatePlan, passes } from "@/domain/circadian";
import { ADHERENCE_PROFILE } from "@/domain/fixtures";

/* The crew performance (round 28) is the gate's own transcript as data:
 * every day's verdict must agree with evaluatePlan run incrementally over
 * the journey's plans, and no figure may be invented. A demo that stamps
 * PASS where the gate bounced is worse than no demo. */

describe("crewPerformance — the stamp says what the gate said", () => {
  const j = demoJourney("miles");
  const perf = crewPerformance(j);

  test("one day per locked plan, in order", () => {
    expect(perf.days.map((d) => d.dayIndex)).toEqual(j.plans.map((p) => p.dayIndex));
    expect(perf.days.length).toBeGreaterThan(0);
  });

  test("every verdict re-runs the gate incrementally", () => {
    const locked = [];
    for (let i = 0; i < j.plans.length; i++) {
      const plan = j.plans[i];
      locked.push(plan);
      const verdict = evaluatePlan({
        trip: j.trip,
        days: [...locked],
        calendar: j.calendar,
        adherence: ADHERENCE_PROFILE,
        baseline: j.baseline,
      });
      expect(perf.days[i].verdict.pass).toBe(passes(verdict));
      expect(perf.days[i].verdict.score).toBeCloseTo(verdict.score, 10);
      expect(perf.days[i].verdict.violations).toEqual(verdict.violations.map((v) => v.code));
    }
  });

  test("cues are the plan's interventions — no invented asks", () => {
    for (let i = 0; i < perf.days.length; i++) {
      const plan = j.plans[i];
      expect(perf.days[i].cues.length).toBe(plan.interventions.length);
      expect(perf.days[i].cues.map((c) => c.startMin)).toEqual(
        plan.interventions.map((iv) => iv.startMin),
      );
      expect(perf.days[i].shiftMin).toBe(plan.shiftMin);
    }
  });

  test("banked minutes are the locked shifts, never more", () => {
    const expected = j.plans.reduce((s, p) => s + Math.abs(p.shiftMin), 0);
    expect(perf.bankedMin).toBe(expected);
  });

  test("the crew lines name four agents and carry real numbers", () => {
    expect(perf.lines.map((l) => l.agent)).toEqual(["Mara", "Sol", "Iris", "Rex"]);
    const cueTotal = j.plans.reduce((s, p) => s + p.interventions.length, 0);
    const sol = perf.lines.find((l) => l.agent === "Sol")!;
    expect(sol.text).toContain(String(cueTotal));
    expect(sol.text).toContain(String(j.plans.length));
    const iris = perf.lines.find((l) => l.agent === "Iris")!;
    expect(iris.text).toContain(`${(Math.round(perf.bankedMin / 6) / 10).toFixed(1)}h`);
  });
});
