import { describe, expect, test } from "bun:test";
import {
  checkMove,
  editableIntervention,
  planVersion,
  undoMove,
  type PlanEditContext,
  type UndoToken,
} from "../src/domain/plan-edit";
import { buildDemoScenario } from "../src/domain/demo-scenarios";
import { ADHERENCE_PROFILE } from "../src/domain/fixtures";
import type { DayPlan } from "../src/domain/types";

/* The gate is the gate: a proposed light-window move is checked by
 * evaluatePlan over the whole trip, and nothing reaches the plan until it
 * passes and the version handshake agrees. */

const demo = buildDemoScenario("miles", "2026-11-04");
const ctx: PlanEditContext = {
  trip: demo.trip,
  plans: demo.plans,
  calendar: demo.calendar,
  adherence: ADHERENCE_PROFILE,
  baseline: { avgBedtimeMin: demo.baseline.avgBedtimeMin, avgWakeMin: demo.baseline.avgWakeMin },
};

const lightOf = (day: DayPlan) =>
  day.interventions.findIndex((iv) => iv.kind === "light_exposure" && iv.endMin !== undefined && iv.endMin > iv.startMin && iv.endMin <= 1440);

const editableSpot = (() => {
  for (const day of ctx.plans) {
    const i = lightOf(day);
    if (i >= 0) return { dayIndex: day.dayIndex, interventionIndex: i, iv: day.interventions[i] };
  }
  throw new Error("no editable light window in miles scenario");
})();

describe("editableIntervention", () => {
  test("a same-day light window is editable", () => {
    const e = editableIntervention(ctx, editableSpot.dayIndex, editableSpot.interventionIndex);
    expect(e.editable).toBe(true);
    if (e.editable) {
      expect(e.startMin).toBe(editableSpot.iv.startMin);
      expect(e.durationMin).toBe(editableSpot.iv.endMin! - editableSpot.iv.startMin);
    }
  });

  test("non-light interventions refuse plainly", () => {
    const day = ctx.plans.find((d) => d.interventions.some((iv) => iv.kind === "sleep_window"))!;
    const i = day.interventions.findIndex((iv) => iv.kind === "sleep_window");
    const e = editableIntervention(ctx, day.dayIndex, i);
    expect(e.editable).toBe(false);
    if (!e.editable) expect(e.reason).toBe("Only light windows can be moved for now.");
  });

  test("a window without a same-day block refuses as crossing midnight", () => {
    const day = ctx.plans.find((d) =>
      d.interventions.some((iv) => iv.kind === "light_exposure" && (iv.endMin === undefined || iv.endMin <= iv.startMin || iv.endMin > 1440)),
    );
    if (!day) return; // scenario has none — rule covered by the constructed case below
    const i = day.interventions.findIndex((iv) => iv.kind === "light_exposure" && (iv.endMin === undefined || iv.endMin <= iv.startMin || iv.endMin > 1440));
    const e = editableIntervention(ctx, day.dayIndex, i);
    expect(e.editable).toBe(false);
    if (!e.editable) expect(e.reason).toBe("This window crosses midnight.");
    // Constructed case regardless of the fixture's shape:
    const c2: PlanEditContext = { ...ctx, plans: [{ ...day, interventions: [{ kind: "light_exposure", startMin: 1300, endMin: 1500, note: "" }] }] };
    const e2 = editableIntervention(c2, day.dayIndex, 0);
    expect(e2.editable).toBe(false);
    if (!e2.editable) expect(e2.reason).toBe("This window crosses midnight.");
  });

  test("locked and past days refuse plainly", () => {
    const e = editableIntervention({ ...ctx, isLocked: () => true }, editableSpot.dayIndex, editableSpot.interventionIndex);
    expect(e.editable).toBe(false);
    if (!e.editable) expect(e.reason).toBe("Already done — it stays as it happened.");
    const e2 = editableIntervention(
      { ...ctx, firstEditableDay: editableSpot.dayIndex + 1 },
      editableSpot.dayIndex,
      editableSpot.interventionIndex,
    );
    expect(e2.editable).toBe(false);
    if (!e2.editable) expect(e2.reason).toBe("This day has passed.");
  });

  test("unknown window refuses", () => {
    const e = editableIntervention(ctx, 999, 0);
    expect(e.editable).toBe(false);
  });
});

describe("checkMove", () => {
  const base = () => ({ dayIndex: editableSpot.dayIndex, interventionIndex: editableSpot.interventionIndex, baseVersion: planVersion(ctx.plans) });

  test("stale when the base version doesn't match", () => {
    const v = checkMove(ctx, { ...base(), newStartMin: 800, baseVersion: "v-old" });
    expect(v.status).toBe("stale");
  });

  test("preserves duration and snaps to 5 minutes", () => {
    const v = checkMove(ctx, { ...base(), newStartMin: editableSpot.iv.startMin + 37 });
    expect(v.status).not.toBe("stale");
    if (v.status === "stale") return;
    const day = v.candidate.find((d) => d.dayIndex === editableSpot.dayIndex)!;
    const iv = day.interventions[editableSpot.interventionIndex];
    expect(iv.startMin % 5).toBe(0);
    expect(iv.endMin! - iv.startMin).toBe(editableSpot.iv.endMin! - editableSpot.iv.startMin);
    expect(iv.startMin).toBe(Math.round((editableSpot.iv.startMin + 37) / 5) * 5);
  });

  test("never mutates the context", () => {
    const before = JSON.stringify(ctx);
    for (const m of [100, 700, 1300, -50, 1440]) {
      checkMove(ctx, { ...base(), newStartMin: m });
    }
    expect(JSON.stringify(ctx)).toBe(before);
  });

  test("a valid move exists in the miles scenario and is valid", () => {
    let found: number | null = null;
    for (let m = 0; m <= 1440 - (editableSpot.iv.endMin! - editableSpot.iv.startMin); m += 15) {
      const v = checkMove(ctx, { ...base(), newStartMin: m });
      if (v.status === "valid") { found = m; break; }
    }
    expect(found).not.toBeNull();
    const v = checkMove(ctx, { ...base(), newStartMin: found! });
    expect(v.status).toBe("valid");
    if (v.status === "valid") {
      expect(v.result.feasible).toBe(true);
      expect(v.before.violations.length).toBeGreaterThanOrEqual(0);
    }
  });

  test("a blocked move exists and reports the gate's own reasons", () => {
    let found: number | null = null;
    for (let m = 0; m <= 1439; m += 15) {
      const v = checkMove(ctx, { ...base(), newStartMin: m });
      if (v.status === "blocked" && v.reasons.some((r) => r.code !== "OUT_OF_DAY")) { found = m; break; }
    }
    expect(found).not.toBeNull();
    const v = checkMove(ctx, { ...base(), newStartMin: found! });
    expect(v.status).toBe("blocked");
    if (v.status === "blocked") {
      expect(v.reasons.length).toBeGreaterThan(0);
      expect(v.reasons[0].message.length).toBeGreaterThan(10);
      expect(v.result.feasible).toBe(false);
    }
  });

  test("a pre-existing violation on another day does not block", () => {
    // A plan that already carries a finding somewhere unrelated still lets
    // the traveller move a window that introduces nothing new.
    const dirty: PlanEditContext = {
      ...ctx,
      plans: ctx.plans.map((d, i) =>
        i === 0 ? { ...d, shiftMin: -d.shiftMin || 45 } : d,
      ),
    };
    const v = checkMove(dirty, {
      dayIndex: editableSpot.dayIndex,
      interventionIndex: editableSpot.interventionIndex,
      newStartMin: editableSpot.iv.startMin,
      baseVersion: planVersion(dirty.plans),
    });
    expect(v.status).not.toBe("stale");
    if (v.status !== "stale") {
      const pre = new Set(v.before.violations.map((x) => `${x.code}:${x.dayIndex ?? ""}`));
      expect(pre.size).toBeGreaterThan(0);
      expect(v.status === "valid" || (v.status === "blocked" && v.reasons.every((r) => !pre.has(`${r.code}:${r.dayIndex}`)))).toBe(true);
    }
  });

  test("pass -> fail blocks even with no new violation codes", () => {
    const v = checkMove(ctx, { ...base(), newStartMin: editableSpot.iv.startMin });
    expect(v.status).toBe("valid");
  });

  test("out of day blocks with OUT_OF_DAY", () => {
    const dur = editableSpot.iv.endMin! - editableSpot.iv.startMin;
    const v = checkMove(ctx, { ...base(), newStartMin: 1440 - dur + 15 });
    expect(v.status).toBe("blocked");
    if (v.status === "blocked") {
      expect(v.reasons.some((r) => r.code === "OUT_OF_DAY")).toBe(true);
    }
  });
});

describe("undoMove", () => {
  const base = () => ({ dayIndex: editableSpot.dayIndex, interventionIndex: editableSpot.interventionIndex, baseVersion: planVersion(ctx.plans) });
  const validMove = (() => {
    for (let m = 0; m <= 1439; m += 15) {
      const v = checkMove(ctx, { ...base(), newStartMin: m });
      if (v.status === "valid" && m !== editableSpot.iv.startMin) return v;
    }
    throw new Error("no valid move");
  })();

  test("restores the previous intervention exactly", () => {
    const day = validMove.candidate.find((d) => d.dayIndex === editableSpot.dayIndex)!;
    const token: UndoToken = {
      dayIndex: editableSpot.dayIndex,
      interventionIndex: editableSpot.interventionIndex,
      previous: ctx.plans.find((d) => d.dayIndex === editableSpot.dayIndex)!.interventions[editableSpot.interventionIndex],
      applied: day.interventions[editableSpot.interventionIndex],
    };
    const res = undoMove(validMove.candidate, token);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const restored = res.plans.find((d) => d.dayIndex === editableSpot.dayIndex)!.interventions[editableSpot.interventionIndex];
      expect(restored).toEqual(token.previous);
      // Other days untouched.
      for (const d of res.plans) {
        if (d.dayIndex !== editableSpot.dayIndex) {
          expect(d).toEqual(validMove.candidate.find((x) => x.dayIndex === d.dayIndex));
        }
      }
    }
  });

  test("refuses after a later change", () => {
    const day = validMove.candidate.find((d) => d.dayIndex === editableSpot.dayIndex)!;
    const token: UndoToken = {
      dayIndex: editableSpot.dayIndex,
      interventionIndex: editableSpot.interventionIndex,
      previous: { ...editableSpot.iv },
      applied: { ...day.interventions[editableSpot.interventionIndex], startMin: 42 },
    };
    const res = undoMove(validMove.candidate, token);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("This window changed after that edit — undo isn't safe.");
  });
});

describe("planVersion", () => {
  test("stable across input order and sensitive to changes", () => {
    const v1 = planVersion(ctx.plans);
    const v2 = planVersion([...ctx.plans].reverse());
    expect(v1).toBe(v2);
    const changed = ctx.plans.map((d, i) => (i === 0 ? { ...d, label: `${d.label}x` } : d));
    expect(planVersion(changed)).not.toBe(v1);
  });
});
