import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildCrewAskPrompt,
  crewAskAvailable,
  crewAskLLM,
  crewAskProviders,
} from "../src/agents/crew-ask";
import { crewAnswer, type CrewFacts } from "../src/domain/crew-answer";
import { coverageOf, fmtMin } from "../src/domain/circadian";
import { previewPlan } from "../src/domain/solver";
import {
  ADHERENCE_PROFILE,
  buildTrip,
  calendarFor,
  GARMIN_BASELINE,
} from "../src/domain/fixtures";
import type { CalendarEvent } from "../src/domain/types";

/* The LLM lane for open questions (agent-native §4a, step 3). The tests pin
 * the two honesty laws: the grounding prompt is built only from the
 * CrewFacts the surface already had (route, windows, the gate's own scan,
 * the crate tally, the baseline, the attached card), and the provider chain
 * is the run's own order — replay never counts as an LLM, a hop's failure
 * retries the next configured provider, and the answers name who spoke. */

const TRIP = buildTrip("LHR", "HND", "2026-10-18");
const CAL = calendarFor(TRIP);
const PREVIEW = previewPlan({
  trip: TRIP,
  calendar: CAL,
  adherence: ADHERENCE_PROFILE,
  baseline: GARMIN_BASELINE,
});
const PLANS = [...PREVIEW.values()].filter(Boolean).map((s) => s!.plan);
const D3 = PLANS.find((d) => d.label === "D-3")!;

const facts: CrewFacts = {
  trip: TRIP,
  owedMin: coverageOf(TRIP, PLANS).residualMin,
  plans: PLANS,
  plansArePreview: true,
  activeDaySpec: TRIP.days.find((d) => d.dayIndex === D3.dayIndex) ?? TRIP.days[0],
  calendar: CAL,
  adherence: ADHERENCE_PROFILE,
  baseline: GARMIN_BASELINE,
  baselineFacts: {
    chronotype: GARMIN_BASELINE.chronotype,
    bedMin: GARMIN_BASELINE.avgBedtimeMin,
    wakeMin: GARMIN_BASELINE.avgWakeMin,
  },
  places: { matched: 3, provenance: "recorded Qloo sample — not a live lookup" },
  context: {
    about: "the crate match card",
    detail: "Scout found the museum — it sits inside your free window on D+1.",
    owner: "Scout",
    agent: null,
  },
};

const ENV_KEYS = ["AGENT_PROVIDER", "AGENT_PROVIDER_FALLBACK"] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("buildCrewAskPrompt — grounding is real state only", () => {
  test("the trip line names the route, the gap and the direction", () => {
    const p = buildCrewAskPrompt({ question: "will I be tired?", facts });
    expect(p.prompt).toContain("LHR→HND");
    expect(p.prompt).toContain("eastward shift");
    expect(p.prompt).toContain("solver preview");
  });

  test("the active day's windows are named with real times", () => {
    const p = buildCrewAskPrompt({ question: "what's the plan?", facts });
    const light = D3.interventions.find((iv) => iv.kind === "light_exposure")!;
    expect(p.prompt).toContain("D-3 windows:");
    expect(p.prompt).toContain(`${fmtMin(light.startMin)} light exposure`);
  });

  test("the conflict count is the gate's own scan, not a paraphrase", () => {
    const cal: CalendarEvent[] = [
      ...CAL,
      { id: "ev-x", title: "Site visit", dayIndex: 0, startMin: 7 * 60, endMin: 9 * 60, movable: false },
    ];
    const p = buildCrewAskPrompt({
      question: "anything clash?",
      facts: { ...facts, calendar: cal },
    });
    expect(p.prompt).toMatch(/conflicts: \d+ flags?/);
    expect(p.prompt).toContain("Site visit");
  });

  test("places, baseline, marked event and the attached card all land", () => {
    const p = buildCrewAskPrompt({ question: "why this place?", facts });
    expect(p.prompt).toContain("places: 3 matched — recorded Qloo sample");
    expect(p.prompt).toContain(
      `baseline: ${GARMIN_BASELINE.chronotype} · bed ${fmtMin(GARMIN_BASELINE.avgBedtimeMin)}`,
    );
    expect(p.prompt).toContain("asked from: the crate match card");
    expect(p.prompt).toContain("QUESTION\nwhy this place?");
  });

  test("no trip is honest — the prompt says so instead of inventing one", () => {
    const p = buildCrewAskPrompt({
      question: "what about my trip?",
      facts: { ...facts, trip: null, plans: [] },
    });
    expect(p.prompt).toContain("trip: none on the table yet");
    expect(p.prompt).not.toContain("windows:");
  });

  test("the voice belongs to the owner; an unknown owner defaults to Otto", () => {
    const iris = buildCrewAskPrompt({ question: "q", owner: "Iris", facts });
    expect(iris.owner).toBe("Iris");
    expect(iris.agent).toBe("evaluator");
    expect(iris.system).toContain("You are Iris");
    expect(iris.system).toContain("at most 60 words");
    const scout = buildCrewAskPrompt({ question: "q", owner: "Scout", facts });
    expect(scout.agent).toBeNull();
    expect(scout.system).toContain("Scout");
    const nobody = buildCrewAskPrompt({ question: "q", owner: "Zed", facts });
    expect(nobody.owner).toBe("Otto");
  });
});

describe("crewAskProviders — the chain is the run's own, replay never counts", () => {
  test("replay-only config means the lane is off", () => {
    process.env.AGENT_PROVIDER = "replay";
    delete process.env.AGENT_PROVIDER_FALLBACK;
    expect(crewAskProviders()).toEqual([]);
    expect(crewAskAvailable()).toBe(false);
  });

  test("the chain is primary first then fallbacks, replay dropped", () => {
    process.env.AGENT_PROVIDER = "featherless";
    process.env.AGENT_PROVIDER_FALLBACK = "nebius,anthropic,featherless";
    expect(crewAskProviders()).toEqual(["featherless", "nebius", "anthropic"]);
    expect(crewAskAvailable()).toBe(true);
  });
});

describe("crewAskLLM — the provider that answered is the one named", () => {
  test("the primary answers and its name is the provenance", async () => {
    process.env.AGENT_PROVIDER = "nebius";
    process.env.AGENT_PROVIDER_FALLBACK = "featherless";
    const seen: string[] = [];
    const r = await crewAskLLM(
      buildCrewAskPrompt({ question: "q", facts }),
      async (kind) => {
        seen.push(kind);
        return `answer on ${kind}`;
      },
    );
    expect(r).toEqual({ answer: "answer on nebius", provider: "nebius" });
    expect(seen).toEqual(["nebius"]);
  });

  test("a failed hop retries the next configured provider", async () => {
    process.env.AGENT_PROVIDER = "featherless";
    process.env.AGENT_PROVIDER_FALLBACK = "nebius";
    const seen: string[] = [];
    const r = await crewAskLLM(
      buildCrewAskPrompt({ question: "q", facts }),
      async (kind) => {
        seen.push(kind);
        if (kind === "featherless") throw new Error("uplink dead");
        return "the fallback speaks";
      },
    );
    expect(r).toEqual({ answer: "the fallback speaks", provider: "nebius" });
    expect(seen).toEqual(["featherless", "nebius"]);
  });

  test("every hop failing throws — never a fake answer", async () => {
    process.env.AGENT_PROVIDER = "nebius";
    delete process.env.AGENT_PROVIDER_FALLBACK;
    await expect(
      crewAskLLM(buildCrewAskPrompt({ question: "q", facts }), async () => {
        throw new Error("down");
      }),
    ).rejects.toThrow("down");
  });

  test("no configured provider throws before any call", async () => {
    process.env.AGENT_PROVIDER = "replay";
    delete process.env.AGENT_PROVIDER_FALLBACK;
    let called = 0;
    await expect(
      crewAskLLM(buildCrewAskPrompt({ question: "q", facts }), async () => {
        called++;
        return "";
      }),
    ).rejects.toThrow("no llm provider");
    expect(called).toBe(0);
  });
});

describe("intent fallthrough — only the honest fallback earns the wire", () => {
  test("an unmatchable question is flagged as the fallback", () => {
    const a = crewAnswer("what's the meaning of life?", facts);
    expect(a.isFallback).toBe(true);
    expect(a.provenance).toContain("intent parser");
  });

  test("resolved intents are never flagged — they stay deterministic", () => {
    const light = D3.interventions.find((iv) => iv.kind === "light_exposure")!;
    for (const q of [
      `why is light at ${fmtMin(light.startMin)}?`,
      "what if I land a day later?",
      "who watches conflicts",
      "when is my caffeine cutoff?",
    ]) {
      expect(crewAnswer(q, facts).isFallback).toBeUndefined();
    }
  });

  test("bare 'why' with a pointing word binds the attached context", () => {
    const a = crewAnswer("why this place?", facts);
    expect(a.owner).toBe("Scout");
    expect(a.answer).toContain("crate match card");
    expect(a.answer).toContain("the museum");
    expect(a.isFallback).toBeUndefined();
  });
});
