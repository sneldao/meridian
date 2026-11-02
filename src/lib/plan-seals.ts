import type { EvalInput } from "@/domain/circadian";
import { planHashOf, tripIdOf } from "@/domain/attestation";
import type { Hex } from "viem";

// Server-side record of plans the scorer actually gated. Minted inside
// `orchestrate` at briefing time — the only point where every field of the
// EvalInput (including the mid-run-adjusted adherence floor) is in scope.
// The attester re-runs evaluatePlan over this stored input, so a client can
// never attest a plan the server didn't see. Same liveness contract as the
// crew-run registry: in-memory, keyed by runId, gone on restart — which is
// honest, because a run the server forgot can't be paid for either.

export interface PlanSeal {
  runId: string;
  tripId: Hex;
  planHash: Hex;
  evalInput: EvalInput;
  sealedAt: number;
}

type Registry = Map<string, PlanSeal>;

function registry(): Registry {
  const g = globalThis as typeof globalThis & { __meridianPlanSeals?: Registry };
  if (!g.__meridianPlanSeals) g.__meridianPlanSeals = new Map();
  return g.__meridianPlanSeals;
}

/** Mint the seal for a finished plan. No-op without a runId — MCP and eval
 *  harness callers don't pay for plans and don't need seals. */
export function sealPlan(runId: string | undefined, evalInput: EvalInput): PlanSeal | null {
  if (!runId) return null;
  const seal: PlanSeal = {
    runId,
    tripId: tripIdOf(evalInput.trip),
    planHash: planHashOf(evalInput),
    evalInput,
    sealedAt: Date.now(),
  };
  registry().set(runId, seal);
  return seal;
}

export function sealForRun(runId: string): PlanSeal | undefined {
  return registry().get(runId);
}
