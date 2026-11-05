import type { CrewAnswer } from "@/domain/crew-answer";
import type { AgentId } from "@/domain/types";

/* The client half of the LLM lane (docs/plan/agent-native.md §4a, step 3).
 * `crewAnswerLLMAvailable` probes the route's own health check once per
 * session — the server reports its real provider config, so a replay env
 * never has to fake capability. `llmFallback` POSTs an open question;
 * every failure returns null so the caller keeps the deterministic
 * fallback — never a fake LLM answer. */

let probe: Promise<boolean> | null = null;

export function crewAnswerLLMAvailable(): Promise<boolean> {
  probe ??= fetch("/api/crew-ask", { cache: "no-store" })
    .then(async (res) =>
      res.ok
        ? ((await res.json()) as { available?: boolean }).available === true
        : false,
    )
    .catch(() => false);
  return probe;
}

export const LLM_ASK_TIMEOUT_MS = 8000;

/** The open-question call. Returns the model's answer as a CrewAnswer with
 *  `llm · {provider}` provenance, or null on any failure — timeout (8s),
 *  503 lane-off, bad payload — so the deterministic message stands. */
export async function llmFallback(input: {
  question: string;
  owner?: string;
  facts?: unknown;
}): Promise<CrewAnswer | null> {
  try {
    const res = await fetch("/api/crew-ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(LLM_ASK_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      answer?: string;
      owner?: string;
      agent?: AgentId | null;
      provenance?: string;
    };
    if (typeof j.answer !== "string" || !j.answer.trim()) return null;
    return {
      owner: typeof j.owner === "string" ? j.owner : "Crew",
      agent: j.agent ?? null,
      answer: j.answer.trim(),
      provenance: typeof j.provenance === "string" ? j.provenance : "llm",
    };
  } catch {
    return null;
  }
}
