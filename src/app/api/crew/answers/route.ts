import { pendingCrewQuestion, resolveCrewQuestion } from "@/lib/crew-questions";
import { crewRun } from "@/lib/crew-runs";
import { tenantOf } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// The traveller's answer to a `crew_question`. One POST resolves the pending
// promise the run is suspended on; the run then emits `crew_answer` on the
// stream so every listener sees what was decided, not just the poster.

export async function POST(req: Request) {
  const tenant = tenantOf(req);
  if (!tenant) {
    return Response.json({ ok: false, error: "session required" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as
    | { questionId?: unknown; optionId?: unknown }
    | null;
  if (typeof body?.questionId !== "string" || typeof body.optionId !== "string") {
    return Response.json(
      { ok: false, error: "questionId and optionId are required" },
      { status: 400 },
    );
  }
  const pending = pendingCrewQuestion(body.questionId);
  const run = pending?.runId ? crewRun(pending.runId) : undefined;
  if (!run?.ownerTenant || run.ownerTenant !== tenant) {
    return Response.json(
      { ok: false, error: "This question is no longer available." },
      { status: 404 },
    );
  }
  const answer = resolveCrewQuestion(body.questionId, body.optionId);
  if (!answer) {
    return Response.json(
      { ok: false, error: "This question is no longer available." },
      { status: 404 },
    );
  }
  return Response.json({ ok: true, answer });
}
