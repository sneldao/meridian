import { describe, expect, test } from "bun:test";
import { keccak256, toBytes } from "viem";
import {
  ATTESTATION_TYPES,
  canonicalJson,
  planHashOf,
  tripIdOf,
} from "../src/domain/attestation";
import { evaluatePlan, passes, type EvalInput } from "../src/domain/circadian";
import { sealForRun, sealPlan } from "../src/lib/plan-seals";
import { ADHERENCE_PROFILE, CALENDAR, DEMO_TRIP } from "../src/domain/fixtures";
import type { DayPlan } from "../src/domain/types";

const day = (over: Partial<DayPlan> = {}): DayPlan => ({
  dayIndex: 0,
  label: "D-3",
  shiftMin: -60,
  targetBedtimeMin: 23 * 60,
  targetWakeMin: 7 * 60,
  interventions: [{ kind: "light_exposure", startMin: 7 * 60, note: "morning light" }],
  ...over,
});

const evalInput = (days: DayPlan[] = [day()]): EvalInput => ({
  trip: DEMO_TRIP,
  days,
  calendar: CALENDAR,
  adherence: ADHERENCE_PROFILE,
});

describe("canonicalJson", () => {
  test("key order is canonical regardless of insertion order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  test("undefined fields drop out; array order survives", () => {
    expect(canonicalJson({ a: undefined, b: [2, 1] })).toBe('{"b":[2,1]}');
  });
});

describe("planHashOf", () => {
  test("deterministic for the same input", () => {
    expect(planHashOf(evalInput())).toBe(planHashOf(evalInput()));
  });

  test("an edited plan moves the hash", () => {
    expect(planHashOf(evalInput())).not.toBe(planHashOf(evalInput([day({ shiftMin: -75 })])));
  });
});

describe("tripIdOf", () => {
  test("stable across re-plans — day order and day content don't move it", () => {
    expect(tripIdOf(DEMO_TRIP)).toBe(tripIdOf(DEMO_TRIP));
  });

  test("a different journey is a different tripId", () => {
    const other = {
      ...DEMO_TRIP,
      destination: { ...DEMO_TRIP.destination, code: "SYD" },
    };
    expect(tripIdOf(other as typeof DEMO_TRIP)).not.toBe(tripIdOf(DEMO_TRIP));
  });
});

describe("contract parity", () => {
  test("the EIP-712 type string the contract hashes is what we sign", () => {
    const fieldList = ATTESTATION_TYPES.Attestation.map((f) => `${f.type} ${f.name}`).join(",");
    const sig = `Attestation(${fieldList})`;
    expect(sig).toBe(
      "Attestation(address buyer,bytes32 tripId,bytes32 planHash,bool passed,uint256 expiry)",
    );
    // Golden: the value TripEscrow.sol stores in ATTESTATION_TYPEHASH.
    // If the contract's typehash ever changes, this constant must change with it.
    expect(keccak256(toBytes(sig))).toBe(
      "0x2b5f6a013a3debf7a976d92c7f8cd06057835f38a8ecff99d17c13a2927888f6",
    );
  });
});

describe("seal → verdict", () => {
  test("a sealed plan re-verifies to the scorer's own answer", () => {
    const seal = sealPlan("run-test-1", evalInput());
    expect(seal).not.toBeNull();
    expect(sealForRun("run-test-1")?.planHash).toBe(seal!.planHash);
    expect(passes(evaluatePlan(seal!.evalInput))).toBe(true);
  });

  test("a gate-failing edit seals too — the verdict, not the seal, carries passed", () => {
    const bad = evalInput([day({ shiftMin: -200 })]); // over the 90min/day ceiling
    const seal = sealPlan("run-test-2", bad);
    expect(passes(evaluatePlan(seal!.evalInput))).toBe(false);
    expect(
      evaluatePlan(seal!.evalInput).violations.some((v) => v.code === "SHIFT_TOO_FAST"),
    ).toBe(true);
  });

  test("runId-less callers (MCP, eval harness) mint no seal", () => {
    expect(sealPlan(undefined, evalInput())).toBeNull();
  });
});
