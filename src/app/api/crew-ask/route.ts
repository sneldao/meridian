import {
  buildCrewAskPrompt,
  crewAskAvailable,
  crewAskLLM,
} from "@/agents/crew-ask";
import type { CrewFacts } from "@/domain/crew-answer";
import { rateLimit, RL_ASK, tooMany } from "@/lib/rateLimit";
import { tenantOf } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/* The LLM lane's endpoint (docs/plan/agent-native.md §4a, step 3).
 *
 * GET is the lane's own health check — `{available}` reflects the server's
 * real provider config, so a replay env never has to fake capability.
 *
 * POST answers a genuinely open question: {question, owner?, facts} where
 * facts is the CrewFacts JSON the surface already built. The deterministic
 * lane stays first — the client only calls here when crewAnswer returned
 * its fallback — and every failure mode (no provider, provider down,
 * timeout) is an honest status, never an invented answer. */

const MAX_BODY_BYTES = 48_000;
const MAX_QUESTION_CHARS = 500;

export async function GET() {
  return Response.json({ available: crewAskAvailable() });
}

export async function POST(req: Request) {
  const tenant = tenantOf(req);
  if (!tenant) {
    return Response.json({ error: "session required" }, { status: 401 });
  }
  if (!crewAskAvailable()) {
    return Response.json(
      { error: "no llm provider configured" },
      { status: 503 },
    );
  }
  const rl = rateLimit(req, "crew-ask", { limit: RL_ASK, windowMs: 60 * 60 * 1000 });
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: "facts payload too large" }, { status: 413 });
  }
  let body: { question?: unknown; owner?: unknown; facts?: unknown };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return Response.json(
      { error: "question must be a non-empty string under 500 chars" },
      { status: 400 },
    );
  }

  const ask = buildCrewAskPrompt({
    question,
    owner: typeof body.owner === "string" ? body.owner : undefined,
    facts: (body.facts ?? null) as CrewFacts | null,
  });
  try {
    const r = await crewAskLLM(ask);
    return Response.json({
      answer: r.answer,
      owner: ask.owner,
      agent: ask.agent,
      provenance: `llm · ${r.provider}`,
    });
  } catch {
    return Response.json(
      { error: "the llm lane is unreachable" },
      { status: 502 },
    );
  }
}
