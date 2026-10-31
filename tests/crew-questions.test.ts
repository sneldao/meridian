import { describe, expect, test } from "bun:test";
import {
  CREW_QUESTION_TTL_MS,
  cancelCrewQuestionsForRun,
  requestCrewQuestion,
  resolveCrewQuestion,
} from "../src/lib/crew-questions";

const OPTIONS = [
  { id: "keep", label: "Still true — keep 07:00" },
  { id: "earlier45", label: "I can do 06:15" },
];

describe("crew questions", () => {
  test("resolve answers the pending question with the picked option", async () => {
    const req = requestCrewQuestion({ runId: "r1", options: OPTIONS });
    const answer = resolveCrewQuestion(req.questionId, "earlier45");
    expect(answer).toEqual({ optionId: "earlier45", skipped: false });
    await expect(req.result).resolves.toEqual({ optionId: "earlier45", skipped: false });
  });

  test("an option that isn't on the card can't resolve it", async () => {
    const req = requestCrewQuestion({ runId: "r1", options: OPTIONS });
    expect(resolveCrewQuestion(req.questionId, "invented")).toBeNull();
    // Still pending — the real answer can still land.
    const answer = resolveCrewQuestion(req.questionId, "keep");
    expect(answer).toEqual({ optionId: "keep", skipped: false });
    await expect(req.result).resolves.toEqual({ optionId: "keep", skipped: false });
  });

  test("unknown and already-answered ids resolve to null", () => {
    expect(resolveCrewQuestion("no-such-question", "keep")).toBeNull();
    const req = requestCrewQuestion({ options: OPTIONS });
    resolveCrewQuestion(req.questionId, "keep");
    expect(resolveCrewQuestion(req.questionId, "keep")).toBeNull();
  });

  test("cancelling a run resolves its open question as skipped on the default", async () => {
    const req = requestCrewQuestion({ runId: "r2", options: OPTIONS });
    expect(cancelCrewQuestionsForRun("r2")).toBe(1);
    await expect(req.result).resolves.toEqual({ optionId: "keep", skipped: true });
  });

  test("cancelling a different run leaves the question pending", async () => {
    const req = requestCrewQuestion({ runId: "r3", options: OPTIONS });
    expect(cancelCrewQuestionsForRun("other-run")).toBe(0);
    resolveCrewQuestion(req.questionId, "earlier45");
    await expect(req.result).resolves.toEqual({ optionId: "earlier45", skipped: false });
  });

  test("expiry resolves skipped on the default option rather than hanging", async () => {
    const realNow = Date.now;
    try {
      const base = realNow();
      Date.now = () => base;
      const req = requestCrewQuestion({ runId: "r4", options: OPTIONS });
      Date.now = () => base + CREW_QUESTION_TTL_MS + 1;
      // The sweep runs on the next registry call — the answer lands as
      // skipped even though nobody ever saw the card.
      expect(resolveCrewQuestion(req.questionId, "keep")).toBeNull();
      await expect(req.result).resolves.toEqual({ optionId: "keep", skipped: true });
    } finally {
      Date.now = realNow;
    }
  });
});
