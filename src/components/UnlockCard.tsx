"use client";

import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";
import { Card } from "@/components/ui";
import {
  approveUsdc,
  connectWallet,
  depositEscrow,
  EscrowState,
  readEscrow,
  readPrice,
  waitTx,
  walletAvailable,
} from "@/lib/escrow";

// The day-2 gate. Held honest by the same rule the rest of the app follows:
// a state is only shown when it's real — "confirming" means a transaction is
// actually in flight, and success is only ever read back off the chain, never
// claimed from a hash. The traveller signs at most two things (approve,
// deposit); the server relays the settle. Copy stays in traveller words:
// held, checked, released, refunded — never "escrow" or "attestation".

type Phase =
  | "idle"
  | "connecting"
  | "checking"
  | "approve-pending"
  | "approve-confirming"
  | "deposit-pending"
  | "deposit-confirming"
  | "settling"
  | "refunded"
  | "error";

const BUSY: Record<Phase, string | null> = {
  idle: null,
  connecting: "Connecting wallet…",
  checking: "Checking your payment…",
  "approve-pending": "Approve the spend in your wallet…",
  "approve-confirming": "Approval confirming…",
  "deposit-pending": "Confirm the payment in your wallet…",
  "deposit-confirming": "Payment confirming…",
  settling: "Checking the plan…",
  refunded: null,
  error: null,
};

function usdc(amount: bigint): string {
  return `${(Number(amount) / 1e6).toFixed(2)} USDC`;
}

const EXPLORER = "https://explorer.testnet.arc.io";

export function UnlockCard({
  runId,
  tripId,
  lockedCount,
  onUnlocked,
}: {
  /** The crew run that sealed the plan — the attester looks it up by this. */
  runId: string;
  /** bytes32 route identity the payment is keyed under. */
  tripId: string;
  /** How many days sit behind the gate — for honest copy. */
  lockedCount: number;
  onUnlocked: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [price, setPrice] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const settle = useCallback(
    async (wallet: Address) => {
      setPhase("settling");
      const res = await fetch("/api/payments/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, wallet, tripId }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        if (res.status === 404) {
          // Held but unattestable: the server lost the seal (restart between
          // deposit and settle). The contract's refund window is the exit —
          // name it, don't just error.
          throw new Error(
            "Your payment is held but this plan can no longer be verified — the run is gone from the server. Your USDC is claimable back on-chain after the 30-day hold.",
          );
        }
        throw new Error(j?.error ?? `settle failed (${res.status})`);
      }
      const j = (await res.json()) as { txHash?: string };
      if (j.txHash) setTxHash(j.txHash);
      // The claim is the chain, not the response — read the escrow back.
      const e = await readEscrow(wallet, tripId as Hex);
      if (e.state === EscrowState.Settled) {
        onUnlocked();
      } else if (e.state === EscrowState.Refunded) {
        setPhase("refunded");
      } else {
        throw new Error("settle landed but the payment didn't move — check the explorer");
      }
    },
    [runId, tripId, onUnlocked],
  );

  const unlock = useCallback(async () => {
    setError(null);
    try {
      setPhase("connecting");
      const wallet = await connectWallet();

      setPhase("checking");
      const existing = await readEscrow(wallet, tripId as Hex);
      if (existing.state === EscrowState.Settled) {
        onUnlocked();
        return;
      }
      if (existing.state === EscrowState.Refunded) {
        setPhase("refunded");
        return;
      }

      if (existing.state === EscrowState.None) {
        const p = price ?? (await readPrice());
        setPrice(p);
        setPhase("approve-pending");
        const aHash = await approveUsdc(wallet, p);
        setPhase("approve-confirming");
        if ((await waitTx(aHash)) !== "success") throw new Error("approval reverted");

        setPhase("deposit-pending");
        const dHash = await depositEscrow(wallet, tripId as Hex);
        setPhase("deposit-confirming");
        if ((await waitTx(dHash)) !== "success") throw new Error("payment reverted");
      }

      // Held — either just deposited or left over from an earlier visit.
      await settle(wallet);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [price, settle, tripId, onUnlocked]);

  // No injected wallet — the honest boundary. Don't pretend the gate doesn't
  // exist (that hands out paid content); don't pretend they can pay.
  if (!walletAvailable()) {
    return (
      <Card className="p-4">
        <h3 className="text-sm font-medium text-paper">
          {lockedCount} more day{lockedCount === 1 ? "" : "s"} unlock with a wallet
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-mist">
          This trip&rsquo;s full week is paid for on Arc — open this page on a device
          with a browser wallet and your plan picks up right here.
        </p>
      </Card>
    );
  }

  const busy = BUSY[phase];

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-paper">
            {phase === "refunded" ? "This trip was refunded" : `Unlock ${lockedCount} more day${lockedCount === 1 ? "" : "s"}`}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-mist">
            {phase === "refunded"
              ? "The plan didn't hold its checks, so your payment came straight back. The days above stay readable."
              : `Held on Arc and released to us only if the plan passes the same checks that built it — refunded automatically if it ever doesn't.${price !== null ? ` ${usdc(price)}, once, for this trip.` : ""}`}
          </p>
          {error && <p className="mt-2 text-xs text-clay-fail">{error}</p>}
          {txHash && (
            <a
              href={`${EXPLORER}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block font-mono2 text-2xs text-mist underline decoration-line underline-offset-2 hover:text-paper"
            >
              the receipt, on Arc →
            </a>
          )}
        </div>
        {phase !== "refunded" && (
          <button
            onClick={unlock}
            disabled={busy !== null}
            className="shrink-0 rounded-lg bg-terracotta px-4 py-2 text-sm font-medium text-white transition-colors hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
          >
            {busy ?? (phase === "error" ? "Try again" : `Unlock${price !== null ? ` · ${usdc(price)}` : ""}`)}
          </button>
        )}
      </div>
    </Card>
  );
}
