import { generateText } from "ai";
import {
  effectiveCalendar,
  evaluatePlan,
  fmtMin,
} from "@/domain/circadian";
import { ADHERENCE_PROFILE } from "@/domain/fixtures";
import { insightFlagCount } from "@/domain/insights";
import type { CrewFacts } from "@/domain/crew-answer";
import type { AgentId, DayPlan } from "@/domain/types";
import { CREW } from "./crew";
import {
  providerFallbacks,
  providerKind,
  resolveModel,
  type ProviderKind,
} from "./providers";

/* The LLM lane for the addressability layer (docs/plan/agent-native.md §4a,
 * step 3). Genuinely open questions — natural language the deterministic
 * lane's intents can't bind — are answered by the same provider chain the
 * night shift runs on (providerKind() primary, providerFallbacks() retry),
 * grounded on the CrewFacts JSON the asking surface already built.
 *
 * Two honesty laws:
 * - Deterministic-first: a question only reaches this module after
 *   crewAnswer returns its fallback, so nothing here competes with real
 *   state — the prompt is built from it.
 * - Availability is real: replay is not an LLM, so the default demo env
 *   reports unavailable and the route answers 503 — the client keeps the
 *   deterministic fallback rather than show a fake LLM answer. */

const hourLabel = (min: number) =>
  (Math.abs(min) / 60).toFixed(1).replace(/\.0$/, "");
const spaced = (s: string) => s.replace(/_/g, " ");
const cut = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

/** owner name → the roster member behind it. Scout is a tool (the crate
 *  matcher), not a person — a fixed voice line instead of a CREW entry. */
const OWNER_AGENT: Record<string, AgentId | null> = {
  Mara: "analyst",
  Jun: "researcher",
  Otto: "planner",
  Iris: "evaluator",
  Rex: "negotiator",
  Scout: null,
};

function ownerFor(owner: unknown): { name: string; agent: AgentId | null } {
  const raw = typeof owner === "string" ? owner.trim().toLowerCase() : "";
  for (const name of Object.keys(OWNER_AGENT)) {
    if (name.toLowerCase() === raw) return { name, agent: OWNER_AGENT[name] };
  }
  return { name: "Otto", agent: "planner" };
}

export interface CrewAskPrompt {
  /** The specialist's voice — a compact stand-in for the member's full run
   *  system prompt, which expects tools and a night shift around it. */
  system: string;
  /** FACTS block + QUESTION — everything the model may cite, bounded. */
  prompt: string;
  owner: string;
  agent: AgentId | null;
}

/** The grounding prompt for one open question. Pure: reads the CrewFacts
 *  JSON the surface already built and quotes only real fields — route and
 *  gap, the day's windows, the gate's own conflict count, the crate tally,
 *  the baseline, and whatever card the ask was opened on. Facts arrive over
 *  the wire untrusted, so every section degrades instead of inventing. */
export function buildCrewAskPrompt(input: {
  question: string;
  owner?: string;
  facts?: CrewFacts | null;
}): CrewAskPrompt {
  const { name, agent } = ownerFor(input.owner);
  const member = agent ? CREW[agent] : null;
  const voice = member
    ? `You are ${member.name} (${member.callsign}), Meridian's specialist who ${member.title}.`
    : "You are Scout, Meridian's place matcher — a tool, not a person.";
  const system = `${voice} Answer the traveller's question in at most 60 words — one or two plain sentences, first person, in your own voice. Ground every claim in the FACTS below; if they can't answer it, say what you'd check instead. Never invent times, places or numbers.`;

  const f = input.facts;
  const lines: string[] = [];
  const trip = f?.trip;
  if (trip?.origin?.code && trip?.destination?.code) {
    lines.push(
      `trip: ${trip.origin.code}→${trip.destination.code} (${trip.destination.name ?? trip.destination.code}) · ${hourLabel(trip.requiredShiftMin)}h ${trip.direction === "east" ? "eastward" : "westward"} shift · ${hourLabel(
        typeof f?.owedMin === "number" ? f.owedMin : Math.abs(trip.requiredShiftMin),
      )}h still owed${f?.plansArePreview ? " (solver preview)" : ""}`,
    );
  } else {
    lines.push("trip: none on the table yet");
  }

  const plans: readonly DayPlan[] = Array.isArray(f?.plans) ? f!.plans : [];
  const day =
    plans.find((d) => d.dayIndex === f?.activeDaySpec?.dayIndex) ?? plans[0];
  if (day && Array.isArray(day.interventions)) {
    const windows = day.interventions
      .slice(0, 8)
      .map((iv) => `${fmtMin(iv.startMin)} ${spaced(iv.kind)}`);
    lines.push(
      `${day.label ?? "the day"} windows: ${windows.length ? windows.join(" · ") : "none planned"}`,
    );
  }

  if (trip && plans.length) {
    try {
      const verdict = evaluatePlan({
        trip,
        days: [...plans],
        calendar: effectiveCalendar([...(f?.calendar ?? [])]),
        adherence: f?.adherence ?? ADHERENCE_PROFILE,
        baseline: f?.baseline,
      });
      const flags = insightFlagCount(verdict);
      lines.push(
        `conflicts: ${
          flags === 0
            ? "none flagged"
            : `${flags} flag${flags === 1 ? "" : "s"}${verdict.violations[0] ? ` — ${cut(verdict.violations[0].message, 140)}` : ""}`
        }`,
      );
    } catch {
      /* a gate that won't run is not a fact — leave the line off */
    }
  }

  if (f?.places) {
    lines.push(`places: ${f.places.matched} matched — ${f.places.provenance}`);
  }
  if (f?.baselineFacts) {
    lines.push(
      `baseline: ${f.baselineFacts.chronotype} · bed ${fmtMin(f.baselineFacts.bedMin)} · wake ${fmtMin(f.baselineFacts.wakeMin)}`,
    );
  }
  if (f?.moment) {
    lines.push(
      `marked event: "${cut(f.moment.title, 60)}" on ${f.moment.dayLabel} at ${fmtMin(f.moment.localMin)} local, ~${fmtMin(f.moment.bodyMin)} estimated body`,
    );
  }
  if (f?.context) {
    lines.push(
      `asked from: ${cut(f.context.about, 120)} — ${cut(f.context.detail, 220)}`,
    );
  }

  return {
    system,
    prompt: `FACTS\n${lines.join("\n")}\n\nQUESTION\n${cut(input.question.trim(), 500)}`,
    owner: name,
    agent,
  };
}

/** The live chain for an open question — the run's own order: primary
 *  first, each configured fallback in turn. Replay is not an LLM and never
 *  enters the chain. */
export function crewAskProviders(): ProviderKind[] {
  const out: ProviderKind[] = [];
  for (const kind of [providerKind(), ...providerFallbacks()]) {
    if (kind !== "replay" && !out.includes(kind)) out.push(kind);
  }
  return out;
}

export function crewAskAvailable(): boolean {
  return crewAskProviders().length > 0;
}

/** One model call, injectable so tests never touch the network. */
export type CrewAskCallModel = (
  kind: ProviderKind,
  system: string,
  prompt: string,
) => Promise<string>;

const defaultCallModel: CrewAskCallModel = async (kind, system, prompt) => {
  const r = await generateText({
    model: resolveModel("specialist", kind),
    system,
    prompt,
    maxOutputTokens: 160,
    temperature: 0.4,
  });
  return r.text;
};

/** Ask the chain. Tries each configured provider in order and reports which
 *  one answered — provenance-on-speech, the same law the chips carry.
 *  Throws when no provider is configured or every hop fails; the route
 *  turns both into honest statuses, never a fake answer. */
export async function crewAskLLM(
  ask: CrewAskPrompt,
  callModel: CrewAskCallModel = defaultCallModel,
): Promise<{ answer: string; provider: ProviderKind }> {
  const chain = crewAskProviders();
  if (!chain.length) throw new Error("no llm provider configured");
  let lastErr: unknown;
  for (const kind of chain) {
    try {
      const text = (await callModel(kind, ask.system, ask.prompt)).trim();
      if (!text) throw new Error("empty answer");
      return { answer: text, provider: kind };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
