import { describe, expect, test } from "bun:test";
import { CREW_CUE, SUN_CUE, type MotionCue } from "../src/domain/motion-cues";

const CUES: MotionCue[] = ["arrive", "work", "done", "fail"];

describe("shared motion vocabulary", () => {
  test("every sun mood resolves to one of the four cues", () => {
    for (const mood of ["sleeping", "drained", "waiting", "lifting", "half-lit", "adjusted"] as const) {
      expect(CUES).toContain(SUN_CUE[mood]);
    }
  });

  test("every crew mood resolves to one of the four cues", () => {
    for (const mood of ["idle", "working", "searching", "asking", "worried", "happy", "settled"] as const) {
      expect(CUES).toContain(CREW_CUE[mood]);
    }
  });

  test("a finished sun and a finished crew agent share the done cue", () => {
    expect(SUN_CUE.adjusted).toBe("done");
    expect(CREW_CUE.settled).toBe("done");
  });

  test("a failing sun and a worried crew agent share the fail cue", () => {
    expect(SUN_CUE.drained).toBe("fail");
    expect(CREW_CUE.worried).toBe("fail");
  });
});
