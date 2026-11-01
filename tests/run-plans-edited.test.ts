import { describe, expect, test } from "bun:test";
import { initialRunState, reduceRun } from "../src/state/run";
import { buildDemoScenario } from "../src/domain/demo-scenarios";

const demo = buildDemoScenario("miles", "2026-11-04");

describe("plans_edited", () => {
  test("replaces the locked set with the edited days", () => {
    const s0 = { ...initialRunState(), trip: demo.trip, locked: new Map(demo.plans.map((d) => [d.label, d])) };
    const edited = demo.plans.map((d) => (d.dayIndex === demo.plans[0].dayIndex ? { ...d, label: `${d.label}x` } : d));
    const s1 = reduceRun(s0, { kind: "plans_edited", days: edited });
    expect(s1.locked.size).toBe(edited.length);
    expect([...s1.locked.keys()]).toContain(`${demo.plans[0].label}x`);
    expect(s1.locked.has(demo.plans[0].label)).toBe(false);
  });
});
