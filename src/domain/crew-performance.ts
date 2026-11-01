import { evaluatePlan, passes } from "./circadian";
import type { DemoJourney } from "./demo-beats";
import { ADHERENCE_PROFILE } from "./fixtures";
import { INTERVENTION_LABELS } from "@/lib/intervention-icons";
import type { InterventionKind } from "./types";

/* The crew's performance as data (round 28).
 *
 *  The demo's plans are pure solver output (buildDemoScenario runs solveDay
 *  day by day), so the honest choreography is: the solver's cues appear, the
 *  day locks, and the gate stamps its real verdict. No planner drift is
 *  invented — where the planner moved nothing, nothing moves. What is
 *  authored is the *pacing* (component), never the figures (this module).
 *
 *  Every day's verdict comes from evaluatePlan over the plans locked up to
 *  and including it — the same incremental judgement the crew run makes. A
 *  FAIL here is stamped as a FAIL; the demo says what the gate said. */

export interface CrewCue {
  kind: InterventionKind;
  /** The traveller-facing word for the ask — owned by intervention-icons. */
  label: string;
  startMin: number;
  note: string;
}

export interface CrewDay {
  dayIndex: number;
  label: string;
  /** Signed minutes of shift the day carries — the lock number. */
  shiftMin: number;
  cues: CrewCue[];
  verdict: {
    pass: boolean;
    score: number;
    /** Violation codes when the gate bounced the day. */
    violations: string[];
  };
}

/** One agent line: who, in their role, said what — computed from the journey
 *  so the copy never outruns the numbers. */
export interface CrewLine {
  agent: string;
  role: string;
  text: string;
}

export interface CrewPerformance {
  days: CrewDay[];
  lines: CrewLine[];
  /** Total minutes banked across the locked days. */
  bankedMin: number;
}

/* The pacing of the performance is data too, so the component only plays
 * what the script says: two beats per day — the solver's cues appear as a
 * draft, then the day locks and the gate stamps. Four agent lines precede
 * the days, one beat each, so the crew is introduced before it works. */

export type CrewBeatPhase = "line" | "draft" | "locked";

export interface CrewBeatStep {
  /** Index into lines for "line" steps, into days for draft/locked. */
  index: number;
  phase: CrewBeatPhase;
}

export function crewScript(lineCount: number, dayCount: number): CrewBeatStep[] {
  const steps: CrewBeatStep[] = [];
  for (let i = 0; i < lineCount; i++) steps.push({ index: i, phase: "line" });
  for (let d = 0; d < dayCount; d++) {
    steps.push({ index: d, phase: "draft" });
    steps.push({ index: d, phase: "locked" });
  }
  return steps;
}

/** The state each element is in once the script has advanced to `pos`.
 *  Lines: how many have spoken. Days: "queued" | "draft" | "locked". */
export function crewStateAt(steps: CrewBeatStep[], pos: number): {
  linesSpoken: number;
  days: ("queued" | "draft" | "locked")[];
} {
  let linesSpoken = 0;
  const byDay = new Map<number, "queued" | "draft" | "locked">();
  for (let i = 0; i <= pos && i < steps.length; i++) {
    const s = steps[i];
    if (s.phase === "line") linesSpoken = Math.max(linesSpoken, s.index + 1);
    else byDay.set(s.index, s.phase === "draft" && byDay.get(s.index) === "locked" ? "locked" : s.phase);
  }
  const dayCount = steps.filter((s) => s.phase === "locked").length;
  return {
    linesSpoken,
    days: Array.from({ length: dayCount }, (_, d) => byDay.get(d) ?? "queued"),
  };
}

export function crewPerformance(journey: DemoJourney): CrewPerformance {
  const days: CrewDay[] = [];
  const locked = [] as typeof journey.plans;

  for (const plan of journey.plans) {
    const verdict = evaluatePlan({
      trip: journey.trip,
      days: [...locked, plan],
      calendar: journey.calendar,
      adherence: ADHERENCE_PROFILE,
      baseline: journey.baseline,
    });
    days.push({
      dayIndex: plan.dayIndex,
      label: plan.label,
      shiftMin: plan.shiftMin,
      cues: plan.interventions.map((iv) => ({
        kind: iv.kind,
        label: INTERVENTION_LABELS[iv.kind] ?? iv.kind,
        startMin: iv.startMin,
        note: iv.note,
      })),
      verdict: {
        pass: passes(verdict),
        score: verdict.score,
        violations: verdict.violations.map((v) => v.code),
      },
    });
    locked.push(plan);
  }

  const bankedMin = days.reduce((s, d) => s + Math.abs(d.shiftMin), 0);
  const cueCount = days.reduce((s, d) => s + d.cues.length, 0);
  const passCount = days.filter((d) => d.verdict.pass).length;

  const lines: CrewLine[] = [
    {
      agent: "Mara",
      role: "ANALYST",
      text: `Baseline read — ${journey.baseline.wearer}. The body wants its sleep where the day says otherwise.`,
    },
    {
      agent: "Sol",
      role: "PLANNER",
      text: `I place ${cueCount} light, sleep and caffeine cues across ${days.length} days, working back from the moment that matters.`,
    },
    {
      agent: "Iris",
      role: "EVAL",
      text: `Gate read: ${passCount} of ${days.length} days pass${passCount === days.length ? "" : " — the rest stay honest"}; ${(Math.round(bankedMin / 6) / 10).toFixed(1)}h of shift banked.`,
    },
    {
      agent: "Rex",
      role: "NEGOTIATOR",
      text: "Calendar holds where it can move; the moment itself never does.",
    },
  ];

  return { days, lines, bankedMin };
}
