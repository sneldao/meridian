import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  isHex,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { evaluatePlan, passes } from "@/domain/circadian";
import {
  ATTESTATION_TTL_S,
  ATTESTATION_TYPES,
  attestationDomain,
  type Attestation,
} from "@/domain/attestation";
import type { PlanSeal } from "@/lib/plan-seals";

// Server-side half of TripEscrow. Attest re-runs the scorer over the sealed
// EvalInput — the verdict is recomputed, never trusted from the client — and
// signs the EIP-712 Attestation the contract verifies. Settle relays that
// attestation on-chain so the traveller signs two transactions (approve,
// deposit), not three. Everything here is dead code without env; the routes
// 503 honestly when the feature isn't configured.

export const TRIP_ESCROW_ABI = parseAbi([
  "function settle(bytes32 tripId, (address buyer, bytes32 tripId, bytes32 planHash, bool passed, uint256 expiry) att, bytes signature) external",
  "function escrows(address buyer, bytes32 tripId) view returns (uint256 amount, uint256 depositedAt, uint8 state)",
  "function getPrice() view returns (uint256)",
]);

export interface PaymentsConfig {
  chainId: number;
  rpcUrl: string;
  contract: Address;
  attesterKey: Hex;
}

export function paymentsConfig(): PaymentsConfig | null {
  const key = process.env.ATTESTER_PRIVATE_KEY;
  const contract = process.env.TRIP_ESCROW_ADDRESS;
  const rpcUrl = process.env.ARC_RPC;
  const chainId = Number(process.env.ARC_CHAIN_ID ?? "5042002");
  if (!key || !contract || !rpcUrl) return null;
  if (!isHex(key) || !isAddress(contract) || !Number.isInteger(chainId) || chainId <= 0) {
    return null;
  }
  return { chainId, rpcUrl, contract, attesterKey: key };
}

export function paymentsEnabled(): boolean {
  return false;
}

export function arcChain(cfg: PaymentsConfig) {
  return defineChain({
    id: cfg.chainId,
    name: "Arc",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl] } },
  });
}

export interface AttestResult {
  attestation: Attestation;
  signature: Hex;
  domain: ReturnType<typeof attestationDomain>;
  /** The recomputed verdict — returned so the UI can say honestly whether
   *  the attestation releases or refunds, and why. */
  verdict: { passed: boolean; score: number; violations: string[] };
}

/** Re-run the scorer over the sealed plan and sign the outcome. The seal is
 *  the only thing attested — a fabricated plan can't reach this function
 *  because it never entered the registry. */
export async function attestForSeal(
  cfg: PaymentsConfig,
  seal: PlanSeal,
  buyer: Address,
): Promise<AttestResult> {
  const result = evaluatePlan(seal.evalInput);
  const passed = passes(result);
  const attestation: Attestation = {
    buyer,
    tripId: seal.tripId,
    planHash: seal.planHash,
    passed,
    expiry: BigInt(Math.floor(Date.now() / 1000)) + ATTESTATION_TTL_S,
  };
  const domain = attestationDomain(cfg.chainId, cfg.contract);
  const account = privateKeyToAccount(cfg.attesterKey);
  const signature = await account.signTypedData({
    domain,
    types: ATTESTATION_TYPES,
    primaryType: "Attestation",
    message: attestation,
  });
  return {
    attestation,
    signature,
    domain,
    verdict: {
      passed,
      score: result.score,
      violations: result.violations.map((v) => v.code),
    },
  };
}

/** Relay settle() on Arc. The relayer is the attester key — its USDC gas
 *  cost is ~$0.001 and the contract still enforces that the attestation is
 *  real, so the relay can only do what the signature says. */
export async function relaySettle(
  cfg: PaymentsConfig,
  attestation: Attestation,
  signature: Hex,
): Promise<{ txHash: Hex; status: string }> {
  const chain = arcChain(cfg);
  const account = privateKeyToAccount(cfg.attesterKey);
  const publicClient = createPublicClient({ chain, transport: http(cfg.rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(cfg.rpcUrl) });
  const txHash = await walletClient.writeContract({
    address: cfg.contract,
    abi: TRIP_ESCROW_ABI,
    functionName: "settle",
    args: [
      attestation.tripId,
      {
        buyer: attestation.buyer,
        tripId: attestation.tripId,
        planHash: attestation.planHash,
        passed: attestation.passed,
        expiry: attestation.expiry,
      },
      signature,
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { txHash, status: receipt.status };
}
