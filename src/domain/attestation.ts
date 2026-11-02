import { keccak256, toBytes, type Address, type Hex } from "viem";
import type { EvalInput } from "@/domain/circadian";
import type { Trip } from "@/domain/types";

// Canonical serialisation and the EIP-712 vocabulary for TripEscrow. Pure —
// no I/O, no env — so bun tests can pin golden vectors against the contract's
// ATTESTATION_TYPEHASH. The contract side lives in contracts/src/TripEscrow.sol;
// the struct definition below must mirror it field for field.

/** Recursive key-sorted JSON — the one byte-exact form of a plan both the
 *  seal minter and the attester hash. Arrays keep order; object keys sort. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

/** The plan the traveller pays for, hashed. Binds payment to the exact
 *  EvalInput the scorer re-runs — trip, locked days, calendar, adherence,
 *  citations, baseline. Any edit moves the hash. */
export function planHashOf(input: EvalInput): Hex {
  return keccak256(toBytes(canonicalJson(input)));
}

/** Stable identity of a trip across re-plans: route, direction and dates,
 *  not the generated artifact. One deposit covers every plan generated for
 *  the same journey — a re-plan is a correction, not a new purchase. */
export function tripIdOf(trip: Trip): Hex {
  const dates = trip.days.map((d) => d.date).sort();
  return keccak256(
    toBytes(
      canonicalJson({
        origin: trip.origin.code,
        destination: trip.destination.code,
        direction: trip.direction,
        requiredShiftMin: trip.requiredShiftMin,
        firstDate: dates[0] ?? null,
        lastDate: dates[dates.length - 1] ?? null,
      }),
    ),
  );
}

export interface Attestation {
  buyer: Address;
  tripId: Hex;
  planHash: Hex;
  passed: boolean;
  /** unix seconds — the contract rejects expired attestations. */
  expiry: bigint;
}

export const ATTESTATION_TYPES = {
  Attestation: [
    { name: "buyer", type: "address" },
    { name: "tripId", type: "bytes32" },
    { name: "planHash", type: "bytes32" },
    { name: "passed", type: "bool" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

export const EIP712_DOMAIN_NAME = "MeridianTripEscrow";
export const EIP712_DOMAIN_VERSION = "1";

export function attestationDomain(chainId: number, verifyingContract: Address) {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

/** Attestation liveness — the backend signs with expiry = now + this. */
export const ATTESTATION_TTL_S = 3600n;
