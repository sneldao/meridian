import { coverageOf, evaluatePlan, fmtMin, passes, sunProgress } from "@/domain/circadian";
import { ADHERENCE_PROFILE, DEMO_TRIP, GARMIN_BASELINE, calendarFor } from "@/domain/fixtures";
import type { AgentId, Citation, CalendarEvent, CrewEvent, DayPlan, EvalResult, Trip } from "@/domain/types";
import { buildIcs, proposeMove } from "@/tools/calendar";
import { fallbackCitations } from "@/tools/science";
import { handoffLines } from "./handoff";
import { replayPlanFor } from "./replay-plan";

// The recorded shift: a full scripted run used for UI development and as
// on-stage fallback. Every eval_result is produced by the real deterministic
// scorer — the drama is scripted, the verdicts are honest.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const BEAT = Number(process.env.REPLAY_BEAT_MS ?? 60);

/** The five scripted day plans (D-3 .. D+1), all valid under the night profile. */
export function scriptedDays(citations: Citation[]): DayPlan[] {
  return [
    {
      dayIndex: 0,
      label: "D-3",
      shiftMin: -60,
      targetBedtimeMin: 22 * 60 + 55,
      targetWakeMin: 5 * 60 + 45,
      interventions: [
        { kind: "light_exposure", startMin: 5 * 60 + 50, endMin: 6 * 60 + 50, note: "Bright light within an hour of the new wake target — the advance anchor.", citationId: citations[2].id },
        { kind: "caffeine_cutoff", startMin: 14 * 60 + 55, note: "Last coffee 8h before the new bedtime.", citationId: citations[0].id },
        { kind: "avoid_light", startMin: 22 * 60, endMin: 22 * 60 + 55, note: "Screens down — protect the earlier bedtime.", citationId: citations[3].id },
        { kind: "sleep_window", startMin: 22 * 60 + 55, endMin: 5 * 60 + 45, note: "Bed 22:55, up 05:45.", citationId: citations[1].id },
      ],
    },
    {
      dayIndex: 1,
      label: "D-2",
      shiftMin: -75,
      targetBedtimeMin: 21 * 60 + 40,
      targetWakeMin: 4 * 60 + 30,
      interventions: [
        { kind: "light_exposure", startMin: 5 * 60, endMin: 6 * 60 + 30, note: "Light at the wake anchor, clear of the 07:30 team breakfast.", citationId: citations[2].id },
        { kind: "caffeine_cutoff", startMin: 13 * 60 + 40, note: "Cutoff tracks the earlier bedtime.", citationId: citations[0].id },
        { kind: "avoid_light", startMin: 20 * 60 + 40, endMin: 21 * 60 + 40, note: "Evening light is the enemy of an advance.", citationId: citations[3].id },
        { kind: "sleep_window", startMin: 21 * 60 + 40, endMin: 4 * 60 + 30, note: "Bed 21:40, up 04:30." },
      ],
    },
    {
      dayIndex: 2,
      label: "D-1",
      shiftMin: -65,
      targetBedtimeMin: 21 * 60 + 45,
      targetWakeMin: 3 * 60 + 45,
      interventions: [
        { kind: "light_exposure", startMin: 3 * 60 + 50, endMin: 4 * 60 + 50, note: "Last pre-flight anchor." },
        { kind: "caffeine_cutoff", startMin: 13 * 60 + 45, note: "8h before the 21:45 bedtime." },
        { kind: "meal_timing", startMin: 19 * 60 + 30, endMin: 21 * 60 + 30, note: "Dinner with Sarah stays — it doubles as the last big meal, nothing after.", citationId: citations[0].id },
        { kind: "avoid_light", startMin: 21 * 60 + 30, endMin: 21 * 60 + 45, note: "Straight home, lights low." },
        { kind: "sleep_window", startMin: 21 * 60 + 45, endMin: 3 * 60 + 45, note: "Bed 21:45 — the dinner pushes it, but cancelling costs more than 15 minutes." },
      ],
    },
    {
      dayIndex: 3,
      label: "Flight",
      shiftMin: -90,
      targetBedtimeMin: 12 * 60 + 30,
      targetWakeMin: 18 * 60 + 30,
      interventions: [
        { kind: "avoid_light", startMin: 11 * 60 + 20, endMin: 12 * 60 + 30, note: "Mask on from boarding — it's already night on the body's new clock." },
        { kind: "sleep_window", startMin: 12 * 60 + 30, endMin: 18 * 60 + 30, note: "Sleep the middle sector — matches destination night." },
        { kind: "light_exposure", startMin: 18 * 60 + 30, endMin: 20 * 60, note: "Cabin lights up + screen on for the last stretch — the arrival-morning anchor.", citationId: citations[2].id },
        { kind: "nap", startMin: 20 * 60 + 30, endMin: 21 * 60, note: "Optional 20min if destroyed — no more." },
      ],
    },
    {
      dayIndex: 4,
      label: "D+1",
      shiftMin: -90,
      targetBedtimeMin: 21 * 60,
      targetWakeMin: 5 * 60,
      interventions: [
        { kind: "light_exposure", startMin: 5 * 60, endMin: 7 * 60, note: "Outside within 30min of waking — destination daylight does the work now.", citationId: citations[2].id },
        { kind: "caffeine_cutoff", startMin: 13 * 60, note: "Local-time cutoff, 8h before bed." },
        { kind: "exercise", startMin: 7 * 60 + 30, endMin: 8 * 60 + 15, note: "Light movement in daylight reinforces the anchor.", citationId: citations[0].id },
        { kind: "sleep_window", startMin: 21 * 60, endMin: 5 * 60, note: "First full night on destination time." },
      ],
    },
  ];
}

export async function* runReplay(trip: Trip = DEMO_TRIP): AsyncGenerator<CrewEvent> {
  const citations = fallbackCitations();
  const locked: DayPlan[] = [];
  const evals: EvalResult[] = [];
  const cal: CalendarEvent[] = calendarFor(trip);
  const east = trip.direction === "east";
  const verb = east ? "advance" : "delay";

  const speak = async function* (agent: AgentId, text: string) {
    const chunks = text.match(/.{1,24}(\s|$)/g) ?? [text];
    for (const c of chunks) {
      yield { type: "agent_token", agent, text: c } as CrewEvent;
      await sleep(30);
    }
  };

  yield {
    type: "run_start",
    provider: "replay",
    trip,
    baseline: GARMIN_BASELINE,
    calendar: cal,
  };
  await sleep(8 * BEAT);

  // --- Analyst -------------------------------------------------------------
  yield { type: "agent_start", agent: "analyst", title: "Mara · ANALYST" };
  yield { type: "tool_call", agent: "analyst", tool: "getWearableBaseline", detail: "" };
  yield { type: "tool_result", agent: "analyst", tool: "getWearableBaseline", detail: "Garmin Fenix 8 · 5 nights" };
  yield { type: "tool_call", agent: "analyst", tool: "getAdherenceProfile", detail: "" };
  yield { type: "tool_result", agent: "analyst", tool: "getAdherenceProfile", detail: "compliance floor 07:00" };
  yield* speak(
    "analyst",
    "Garmin says: late chronotype, bed 23:55, up 06:45, 6h50 of sleep. HRV stable. And he ignores anything scheduled before 07:00 — mornings get one shot, evenings are where we win.",
  );
  yield { type: "agent_end", agent: "analyst" };

  // --- Researcher ----------------------------------------------------------
  yield { type: "agent_start", agent: "researcher", title: "Jun · RESEARCH" };
  yield { type: "tool_call", agent: "researcher", tool: "searchScience", detail: `"circadian phase shift timed light exposure ${east ? "eastward" : "westward"} travel"` };
  yield { type: "tool_result", agent: "researcher", tool: "searchScience", detail: "4 results" };
  for (const c of citations.slice(0, 3)) {
    yield { type: "citation", agent: "researcher", citation: c };
    await sleep(4 * BEAT);
  }
  yield { type: "tool_call", agent: "researcher", tool: "searchScience", detail: `"caffeine timing sleep onset phase ${verb} jet lag"` };
  yield { type: "tool_result", agent: "researcher", tool: "searchScience", detail: "3 results" };
  yield { type: "citation", agent: "researcher", citation: citations[3] };
  yield* speak(
    "researcher",
    east
      ? "Four papers worth building on. Morning light advances the clock — that's our lever. Caffeine's half-life makes anything after ~8h pre-bed a tax on the shift."
      : "Four papers worth building on. Evening light delays the clock — that's our lever; morning light is the enemy. Caffeine's half-life makes anything after ~8h pre-bed a tax on the shift.",
  );
  yield { type: "agent_end", agent: "researcher" };

  // --- Planner + evaluator, day by day --------------------------------------
  // Route-aware plans; the deliberately bad first drafts make recovery visible.
  const { days, badFirstDrafts } = replayPlanFor(trip, cal, citations, ADHERENCE_PROFILE);

  for (let i = 0; i < days.length; i++) {
    const scriptedBad = badFirstDrafts.get(i) ?? null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const candidate = attempt === 1 && scriptedBad ? scriptedBad : days[i];
      yield { type: "agent_start", agent: "planner", title: "Otto · PLANNER" };
      yield* speak(
        "planner",
        attempt === 1 && scriptedBad
          ? `${candidate.label}: drafting an ambitious shift — ${Math.abs(candidate.shiftMin)} minutes.`
          : `${candidate.label}: ${Math.abs(candidate.shiftMin)}min ${verb}, ${candidate.interventions.length} interventions.`,
      );
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
        adherence: ADHERENCE_PROFILE,
        baseline: GARMIN_BASELINE,
      });
      evals.push(result);
      yield { type: "eval_result", result, attempt };
      yield { type: "agent_start", agent: "evaluator", title: "Iris · EVAL" };
      yield* speak(
        "evaluator",
        result.feasible
          ? `Clean. Score ${result.score.toFixed(2)} — ${result.notes.length ? "one adherence caveat, nothing structural." : "no violations."}`
          : `Rejected. ${result.violations[0].message}`,
      );
      yield { type: "agent_end", agent: "evaluator" };
      yield { type: "agent_end", agent: "planner" };

      if (passes(result)) {
        locked.push(candidate);
        yield { type: "day_locked", day: candidate, sunProgress: sunProgress(trip, locked) };
        await sleep(8 * BEAT);
        break;
      }
      await sleep(6 * BEAT);
    }
  }

  // --- Negotiator ------------------------------------------------------------
  yield { type: "agent_start", agent: "negotiator", title: "Rex · NEGOTIATOR" };
  yield* speak("negotiator", "Plan's locked. Now the calendar bends. Three moves and we're clean.");

  const d1Bed = locked.find((d) => d.dayIndex === 2)?.targetBedtimeMin;
  const moves: [string, number, number, string][] = east
    ? [
        ["ev-gym-1", 1, 12 * 60 + 30, "Evenings are protected for the light curfew — gym moves to lunch."],
        ["ev-deep-1", 1, 10 * 60 + 30, "Deep work slides into the post-anchor alertness window."],
        ["ev-pack", 2, 15 * 60, `Packing earlier keeps the wind-down intact before a ${d1Bed !== undefined ? fmtMin(d1Bed) : "earlier"} bedtime.`],
      ]
    : [
        ["ev-standup-1", 1, 11 * 60, "Mornings stay dim while the clock delays — standup slides later."],
        ["ev-deep-1", 1, 16 * 60 + 30, "Deep work moves into the later alertness peak."],
        ["ev-gym-0", 0, 20 * 60, "Gym moves into the evening — movement and light both push the clock later."],
      ];
  for (const [id, dayIdx, start, reason] of moves) {
    const r = proposeMove(cal, id, dayIdx, start);
    if (r.ok) {
      r.move.reason = reason;
      yield { type: "tool_call", agent: "negotiator", tool: "proposeMove", detail: `${r.move.title} → day ${dayIdx}` };
      yield { type: "calendar_move", move: r.move };
      await sleep(5 * BEAT);
    }
  }
  yield { type: "tool_call", agent: "negotiator", tool: "commitPlan", detail: "" };
  yield { type: "tool_result", agent: "negotiator", tool: "commitPlan", detail: "3 events committed" };
  yield* speak("negotiator", "Calendar's clean. Board meeting untouched — we routed around the walls, not through them.");
  yield { type: "agent_end", agent: "negotiator" };

  // --- Briefing ---------------------------------------------------------------
  const ics = buildIcs(cal, trip);
  // Same aggregation as the live orchestrator: mean of the passing verdicts.
  const scores = evals.filter((e) => e.feasible).map((e) => e.score);
  const meanScore = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0;
  const coverage = coverageOf(trip, locked);
  const movedCount = cal.filter((e) => e.movedTo).length;
  const route = `${trip.origin.name} → ${trip.destination.name}`;
  const shiftLine = coverage.complete
    ? `fully adapted on landing`
    : `${Math.round(coverage.ratio * 100)}% of the ${route} shift covered before you land — ${Math.round(coverage.residualMin / 6) / 10}h still owed at touchdown, and the crew keeps working after you land`;
  const summary = `Night shift complete. ${locked.length} days locked, ${coverage.achievedMin} of ${coverage.requiredMin} minutes shifted (${shiftLine}). ${citations.length} papers cited. Calendar: ${movedCount} events rescheduled, every fixed commitment intact.`;
  yield {
    type: "briefing",
    summary,
    ics,
    score: meanScore,
    citations,
    days: locked,
    coverage,
    lines: handoffLines({
      locked: locked.length,
      total: trip.days.length,
      score: meanScore,
      coverage,
      summary,
      days: locked,
      citationTitles: citations.map((c) => c.title),
    }),
  };
  await sleep(4 * BEAT);
  yield { type: "done" };
}
