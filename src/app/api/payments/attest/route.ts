import { NextRequest, NextResponse } from "next/server";
import { isAddress, isHex } from "viem";
import { sealForRun } from "@/lib/plan-seals";
import { attestForSeal, paymentsConfig, paymentsEnabled } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** POST {runId, wallet, tripId} → the signed EIP-712 Attestation over the
 *  sealed plan. The verdict is recomputed server-side from the stored
 *  EvalInput — the client supplies only pointers (runId), never the plan or
 *  its score. */
export async function POST(req: NextRequest) {
  if (!paymentsEnabled()) {
    return NextResponse.json({ enabled: false }, { status: 503 });
  }
  const cfg = paymentsConfig();
  if (!cfg) {
    return NextResponse.json({ enabled: false }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as {
    runId?: string;
    wallet?: string;
    tripId?: string;
  } | null;
  if (!body?.runId || !isAddress(body.wallet ?? "") || !isHex(body.tripId ?? "")) {
    return NextResponse.json({ error: "runId, wallet (address) and tripId (bytes32) required" }, { status: 400 });
  }
  const seal = sealForRun(body.runId);
  if (!seal) {
    return NextResponse.json(
      { error: "no sealed plan for that run — the server restarted or the plan never gated" },
      { status: 404 },
    );
  }
  if (seal.tripId !== body.tripId) {
    return NextResponse.json({ error: "tripId does not match the sealed plan" }, { status: 409 });
  }
  const { attestation, signature, domain, verdict } = await attestForSeal(
    cfg,
    seal,
    body.wallet as `0x${string}`,
  );
  return NextResponse.json({
    attestation: { ...attestation, expiry: attestation.expiry.toString() },
    signature,
    domain,
    verdict,
  });
}
