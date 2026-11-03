import { describe, expect, test } from "bun:test";
import { CREW_STATE_CUE, CUE_HOLD_MS, SUN_CUE, type MotionCue } from "../src/domain/motion-cues";
import { MOOD_STATE } from "../src/components/CrewFaces";

const CUES: MotionCue[] = ["arrive", "work", "done", "fail"];

describe("shared motion vocabulary", () => {
  test("every sun mood resolves to one of the four cues", () => {
    for (const mood of ["sleeping", "drained", "waiting", "lifting", "half-lit", "adjusted"] as const) {
      expect(CUES).toContain(SUN_CUE[mood]);
    }
  });

  // The crew's moods live in CrewFaces and reach CSS through MOOD_STATE →
  // pose → cue. Asserting a private mood→cue table instead would have passed
  // while nothing rendered it, so this walks the path the DOM actually takes.
  test("every crew mood resolves through its pose to one of the four cues", () => {
    for (const [mood, state] of Object.entries(MOOD_STATE)) {
      expect(CUES, mood).toContain(CREW_STATE_CUE[state]);
    }
  });

  test("a finished sun and a finished crew agent share the done cue", () => {
    expect(SUN_CUE.adjusted).toBe("done");
    expect(CREW_STATE_CUE[MOOD_STATE.settled]).toBe("done");
    expect(CREW_STATE_CUE[MOOD_STATE.happy]).toBe("done");
  });

  test("a failing sun and a worried crew agent share the fail cue", () => {
    expect(SUN_CUE.drained).toBe("fail");
    expect(CREW_STATE_CUE[MOOD_STATE.worried]).toBe("fail");
  });

  test("one hold window covers the pulse on both surfaces", () => {
    // `sunself-pulse` runs 700ms; the card's MARKED DONE and the evaluator's
    // verdict both stay up for CUE_HOLD_MS, which has to outlast it.
    expect(CUE_HOLD_MS).toBeGreaterThanOrEqual(700);
  });
});
