import { resolveCrewQuestion } from "@/lib/crew-questions";

export const dynamic = "force-dynamic";

// The traveller's answer to a `crew_question`. One POST resolves the pending
// promise the run is suspended on; the run then emits `crew_answer` on the
// stream so every listener sees what was decided, not just the poster.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { questionId?: string; optionId?: string }
    | null;
  if (!body?.questionId || typeof body.optionId !== "string") {
    return Response.json(
      { ok: false, error: "questionId and optionId are required" },
      { status: 400 },
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
