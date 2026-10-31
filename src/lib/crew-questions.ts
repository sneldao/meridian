import type { CrewQuestionOption } from "@/domain/types";

// Pending crew questions, in-process like the calendar approvals store. A
// question suspends the run where the approval does: the runtime emits
// `crew_question`, awaits the registry promise, and continues on the
// traveller's pick — or on the first (default) option when it expires or
// the run is cancelled. TTL is shorter than the calendar approval's: the
// run is being watched live, so a question nobody answers should let the
// crew decide, not hold the stream open for half an hour.

interface PendingCrewQuestion {
  id: string;
  runId?: string;
  createdAt: number;
  options: CrewQuestionOption[];
  resolve: (answer: { optionId: string; skipped: boolean }) => void;
}

type Store = Map<string, PendingCrewQuestion>;

const store = (): Store => {
  const g = globalThis as typeof globalThis & { __meridianCrewQuestions?: Store };
  g.__meridianCrewQuestions ??= new Map();
  return g.__meridianCrewQuestions;
};

export const CREW_QUESTION_TTL_MS = 5 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [id, q] of store()) {
    if (now - q.createdAt > CREW_QUESTION_TTL_MS) {
      q.resolve({ optionId: q.options[0]?.id ?? "", skipped: true });
      store().delete(id);
    }
  }
}

export function requestCrewQuestion(payload: {
  runId?: string;
  options: CrewQuestionOption[];
}): { questionId: string; expiresAt: string; result: Promise<{ optionId: string; skipped: boolean }> } {
  sweep();
  const questionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + CREW_QUESTION_TTL_MS).toISOString();
  let resolve!: (answer: { optionId: string; skipped: boolean }) => void;
  const result = new Promise<{ optionId: string; skipped: boolean }>((r) => {
    resolve = r;
  });
  store().set(questionId, {
    id: questionId,
    runId: payload.runId,
    createdAt: Date.now(),
    options: payload.options,
    resolve,
  });
  return { questionId, expiresAt, result };
}

/** Answer a pending question. Returns the resolution for the response, or
 *  null when the id is unknown, expired, or the option isn't on the card. */
export function resolveCrewQuestion(
  questionId: string,
  optionId: string,
): { optionId: string; skipped: boolean } | null {
  sweep();
  const q = store().get(questionId);
  if (!q || !q.options.some((o) => o.id === optionId)) return null;
  store().delete(questionId);
  const answer = { optionId, skipped: false };
  q.resolve(answer);
  return answer;
}

/** Resolve every pending question for a run as skipped — used by run
 *  cancellation so a killed run never leaves its promise hanging. */
export function cancelCrewQuestionsForRun(runId: string): number {
  sweep();
  let cancelled = 0;
  for (const [id, q] of store()) {
    if (q.runId !== runId) continue;
    q.resolve({ optionId: q.options[0]?.id ?? "", skipped: true });
    store().delete(id);
    cancelled += 1;
  }
  return cancelled;
}

