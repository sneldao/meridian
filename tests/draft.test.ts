import { describe, expect, test } from "bun:test";
import {
  describeDrift,
  draftDrift,
  mergeWithDraft,
  planSubmissionSchema,
} from "../src/domain/draft";
import type { DayPlan } from "../src/domain/types";

// The draft is the default: what the planner does not mention keeps the
// solver's value. Without that, a draft in the prompt is a suggestion, and
// nothing would say whether the solver's work survived.

const draft: DayPlan = {
  dayIndex: 0,
  label: "D-3",
  shiftMin: -90,
  targetBedtimeMin: 22 * 60 + 25,
  targetWakeMin: 5 * 60 + 15,
  interventions: [
    { kind: "light_exposure", startMin: 7 * 60, endMin: 8 * 60, note: "Bright light at 07:00." },
    { kind: "caffeine_cutoff", startMin: 14 * 60 + 20, note: "Last coffee." },
    { kind: "avoid_light", startMin: 21 * 60 + 25, endMin: 22 * 60 + 25, note: "Screens down." },
    { kind: "sleep_window", startMin: 22 * 60 + 25, endMin: 5 * 60 + 15, note: "Bed 22:25, up 05:15." },
  ],
};

describe("mergeWithDraft", () => {
  test("an empty submission is the draft, unchanged", () => {
    const merged = mergeWithDraft(draft, {});
    expect(merged.shiftMin).toBe(-90);
    expect(merged.targetBedtimeMin).toBe(draft.targetBedtimeMin);
    expect(merged.interventions).toHaveLength(4);
    expect(merged.interventions[0].startMin).toBe(7 * 60);
    expect(merged.interventions[0].note).toBe("Bright light at 07:00.");
  });

  test("a note changes without moving the time", () => {
    const merged = mergeWithDraft(draft, {
      interventions: [
        { kind: "light_exposure", note: "Step outside — the light does the work." },
      ],
    });
    const light = merged.interventions.find((i) => i.kind === "light_exposure");
    expect(light?.startMin).toBe(7 * 60);
    expect(light?.endMin).toBe(8 * 60);
    expect(light?.note).toBe("Step outside — the light does the work.");
    // The cues the planner did not mention are gone: its list is the plan.
    expect(merged.interventions).toHaveLength(1);
  });

  test("an explicit time wins over the draft's", () => {
    const merged = mergeWithDraft(draft, {
      interventions: [
        { kind: "light_exposure", startMin: 6 * 60 + 30, endMin: 7 * 60 + 30, note: "Earlier." },
      ],
    });
    const light = merged.interventions.find((i) => i.kind === "light_exposure");
    expect(light?.startMin).toBe(6 * 60 + 30);
    expect(light?.endMin).toBe(7 * 60 + 30);
  });

  test("a citation attaches to the draft's block", () => {
    const merged = mergeWithDraft(draft, {
      interventions: [{ kind: "light_exposure", citationId: "W123" }],
    });
    expect(merged.interventions[0].citationId).toBe("W123");
  });

  test("a submitted shift wins, and the times stay put", () => {
    const merged = mergeWithDraft(draft, { shiftMin: -60 });
    expect(merged.shiftMin).toBe(-60);
    expect(merged.interventions[0].startMin).toBe(7 * 60);
  });
});

describe("draftDrift", () => {
  test("a plan that adopts the draft has no drift", () => {
    const drift = draftDrift(draft, mergeWithDraft(draft, {}));
    expect(drift.shiftChanged).toBe(false);
    expect(drift.minutesMoved).toBe(0);
    expect(drift.cuesKept).toBe(4);
    expect(drift.kindsChanged).toEqual([]);
    expect(describeDrift(drift)).toContain("kept the solver's draft");
  });

  test("a moved cue is counted, not judged", () => {
    const drift = draftDrift(
      draft,
      mergeWithDraft(draft, {
        interventions: [
          { kind: "light_exposure", startMin: 6 * 60 + 30, endMin: 7 * 60 + 30, note: "Earlier." },
        ],
      }),
    );
    expect(drift.minutesMoved).toBe(30);
    expect(drift.kindsChanged).toEqual([
      "caffeine_cutoff",
      "avoid_light",
      "sleep_window",
    ]);
    expect(describeDrift(drift)).toContain("cues moved 30min");
  });

  test("a changed shift is named", () => {
    const drift = draftDrift(draft, mergeWithDraft(draft, { shiftMin: -60 }));
    expect(drift.shiftChanged).toBe(true);
    expect(drift.shiftDeltaMin).toBe(30);
    expect(describeDrift(drift)).toContain("shift +30min");
  });
});


describe("the submission schema", () => {
  test("an empty submission is valid — the draft is the default", () => {
    const parsed = planSubmissionSchema.parse({});
    expect(parsed.shiftMin).toBeUndefined();
    expect(parsed.interventions).toBeUndefined();
  });

  test("a note without a time is valid", () => {
    const parsed = planSubmissionSchema.parse({
      interventions: [{ kind: "light_exposure", note: "Step outside." }],
    });
    expect(parsed.interventions?.[0].startMin).toBeUndefined();
    expect(parsed.interventions?.[0].note).toBe("Step outside.");
  });

  test("an unknown kind is rejected", () => {
    expect(() =>
      planSubmissionSchema.parse({ interventions: [{ kind: "sauna" }] }),
    ).toThrow();
  });
});
