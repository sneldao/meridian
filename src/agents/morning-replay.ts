import { coverageOf, evaluatePlan, fmtMin, passes, sunProgress } from "@/domain/circadian";
import { foldCheckIns, summarizeCheckIn } from "@/domain/adherence";
import { ADHERENCE_PROFILE, DEMO_TRIP, GARMIN_BASELINE, calendarFor } from "@/domain/fixtures";
import type { AdherenceProfile, AgentId, CalendarEvent, CheckIn, CrewEvent, DayPlan, EvalResult, Trip } from "@/domain/types";
import { buildIcs } from "@/tools/calendar";
import { fallbackCitations } from "@/tools/science";
import { replayPlanFor } from "./replay-plan";

// The recorded morning shift: the adherence-replan beat without a live
// provider. Mirrors orchestrate's replan event order. Remaining days are
// re-scored under the folded adherence profile, so the verdicts are honest
// even though the drafts are scripted.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BEAT = Number(process.env.REPLAY_BEAT_MS ?? 60);

async function* speak(agent: AgentId, text: string): AsyncGenerator<CrewEvent> {
  const chunks = text.match(/.{1,24}(\s|$)/g) ?? [text];
  for (const c of chunks) {
    yield { type: "agent_token", agent, text: c } as CrewEvent;
    await sleep(30);
  }
}

export async function* runMorningReplay(opts: {
  startDayIndex: number;
  checkIns: CheckIn[];
  trip?: Trip;
}): AsyncGenerator<CrewEvent> {
  const trip = opts.trip ?? DEMO_TRIP;
  const adherence: AdherenceProfile = opts.checkIns.length
    ? foldCheckIns(ADHERENCE_PROFILE, opts.checkIns)
    : ADHERENCE_PROFILE;
  const citations = fallbackCitations();
  const cal: CalendarEvent[] = calendarFor(trip);
  const specs = trip.days.filter((d) => d.dayIndex >= opts.startDayIndex);
  const dropped = trip.days.filter((d) => d.dayIndex < opts.startDayIndex).map((d) => d.dayIndex);
  const locked: DayPlan[] = [];
  const evals: EvalResult[] = [];

  yield {
    type: "run_start",
    provider: "replay",
    trip,
    baseline: GARMIN_BASELINE,
    calendar: cal,
  };
  for (const checkIn of opts.checkIns) yield { type: "check_in", checkIn };
  if (opts.startDayIndex > 0) {
    yield {
      type: "replan",
      droppedDays: dropped,
      reason: "morning shift: replanning remaining days with updated adherence",
    };
  }
  await sleep(4 * BEAT);

  // --- Analyst: reads what the wearer actually did ---------------------------
  yield { type: "agent_start", agent: "analyst", title: "Mara · ANALYST" };
  yield { type: "tool_call", agent: "analyst", tool: "getAdherenceProfile", detail: "" };
  yield {
    type: "tool_result",
    agent: "analyst",
    tool: "getAdherenceProfile",
    detail: `compliance floor ${fmtMin(adherence.ignoresInterventionsBeforeMin)}`,
  };
  const reported = opts.checkIns.length
    ? `The wearer reported: ${opts.checkIns.map(summarizeCheckIn).join("; ")}.`
    : "No check-ins this morning.";
  yield* speak(
    "analyst",
    `${reported} The compliance floor is now ${fmtMin(adherence.ignoresInterventionsBeforeMin)}. Replanning ${specs.map((s) => s.label).join(", ")} from here.`,
  );
  yield { type: "agent_end", agent: "analyst" };

  // --- Planner + evaluator, remaining days only ------------------------------
  const scripted = replayPlanFor(trip, cal, citations, adherence).days;
  for (const spec of specs) {
    const candidate = scripted.find((d) => d.dayIndex === spec.dayIndex);
    if (!candidate) continue;

    yield { type: "agent_start", agent: "planner", title: "Otto · PLANNER" };
    yield* speak("planner", `${candidate.label}: re-drafting against the updated profile — ${candidate.interventions.length} interventions.`);
    yield {
      type: "tool_call",
      agent: "planner",
      tool: "submitDayPlan",
      detail: `shift ${candidate.shiftMin}min, ${candidate.interventions.length} interventions`,
    };
    yield { type: "plan_candidate", day: candidate };

    const result = evaluatePlan({
      trip,
      days: [...locked, candidate],
      calendar: cal,
      adherence,
      baseline: GARMIN_BASELINE,
    });
    evals.push(result);
    yield { type: "eval_result", result, attempt: 1 };
    yield { type: "agent_start", agent: "evaluator", title: "Iris · EVAL" };
    yield* speak(
      "evaluator",
      result.feasible
        ? `Clean under the new profile. Score ${result.score.toFixed(2)}.`
        : `Rejected. ${result.violations[0].message}`,
    );
    yield { type: "agent_end", agent: "evaluator" };
    yield { type: "agent_end", agent: "planner" };

    if (passes(result)) {
      locked.push(candidate);
      yield { type: "day_locked", day: candidate, sunProgress: sunProgress(trip, locked) };
      await sleep(4 * BEAT);
    } else {
      yield {
        type: "error",
        message: `${candidate.label} could not be replanned within physiological limits — flagged for human review`,
        recoverable: true,
      };
    }
  }

  // --- Negotiator: the night shift's calendar already holds -----------------
  yield { type: "agent_start", agent: "negotiator", title: "Rex · NEGOTIATOR" };
  yield* speak("negotiator", "Nothing new to move this morning. The night shift's calendar still holds.");
  yield { type: "agent_end", agent: "negotiator" };

  // --- Briefing ---------------------------------------------------------------
  const scores = evals.filter((e) => e.feasible).map((e) => e.score);
  const meanScore = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : 0;
  const coverage = coverageOf(trip, locked);
  yield {
    type: "briefing",
    summary: `Morning replan complete. ${locked.length} of ${specs.length} remaining days re-locked after ${opts.checkIns.length} check-in(s). ${Math.round(coverage.ratio * 100)}% of the shift covered, ${Math.round(coverage.residualMin / 6) / 10}h still owed at touchdown.`,
    ics: buildIcs(cal, trip),
    score: meanScore,
    citations,
    days: locked,
    coverage,
  };
  await sleep(2 * BEAT);
  yield { type: "done" };
}
