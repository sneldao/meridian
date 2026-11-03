<!-- PROPOSAL + STATUS — captures the 2026-11-02 decision and the shipped
     contract/app implementation. The beta currently keeps the payment gate
     force-off; see Phase 3 before assuming env can enable it. -->

# Payments on Arc — per-trip escrow, attested release (proposed 2026-11-02)

## The question that decides everything

On-chain payment is only worth building if removing the contract removes a
product feature. A boolean paywall (`address → paid?`) fails that test: it is
a Stripe webhook with worse UX. The designs were judged on one axis each —
friction added for the traveller vs. differentiation earned:

| Design | Traveller friction | Differentiation |
|---|---|---|
| Lifetime entitlement (TripPass.sol, as specced) | High — wallet + approve + purchase at the moment of intent | Low — interchangeable with a card paywall |
| Per-trip pass | Same | Low-Medium — right unit of purchase (nobody has permanent jet lag), still just a gate |
| **Outcome escrow** | Same payment friction — but it buys something | **High — "money back if the plan fails the gate" is a claim no card processor can cheaply make** |
| Crew agentic payments | Zero — invisible to the traveller | Medium — narrative unless paid research visibly improves plans |
| Sponsored pool (B2B `/team`) | Negative — employer pays | Medium — real but unglamorous |

Verdict from that read: **don't put crypto at the paywall; put it at the
promise.** This plan builds outcome escrow, on a per-trip unit.

## Why Arc and not another chain

Arc went public-mainnet 2026-09-16. Two properties fix real problems in this
flow; the rest is narrative:

- **USDC is gas.** The traveller needs exactly one asset — the same USDC
  they're paying with. No "you also need ETH" second-transaction surprise,
  which is the silent killer on every other EVM chain. Fees ~$0.001, EWMA-
  smoothed, so the dollar cost is predictable.
- **Sub-second deterministic finality.** The
  `approve → deposit → settle` sequence compresses into a checkout spinner.
  On a ~12s-finality chain that UI is a liability; here it's a beat.
- CCTP keeps treasury funds unstranded; EVM means standard tooling.

The honest caveat: Arc shaves *seconds*, not *onboarding*. The dominant
friction is the traveller already holding USDC on Arc in a connected wallet.
No contract fixes that — only an embedded wallet + fiat on-ramp does, and
that is deferred (§Open questions). For a real-traveller paywall, Apple Pay
still wins on friction; this integration's value is the guarantee mechanism
and the agentic-payments story, not checkout speed.

## The design — `TripEscrow.sol`

One contract, three behaviours, no token, no upgrade path. Per-trip unit:
`escrow[buyer][tripId]` — the same wallet can pay for many trips, never
twice for the same one.

| Function | Actor | Behaviour |
|---|---|---|
| `deposit(bytes32 tripId)` | Traveller | Pulls `price` USDC via `safeTransferFrom` into escrow. Reverts `AlreadyDeposited` on repeat. Emits `Deposited(buyer, tripId, amount)`. |
| `settle(bytes32 tripId, bytes attestation)` | Anyone (relayed by backend) | Verifies an EIP-712 attestation signed by `attester` over `{buyer, tripId, planHash, passed, expiry}`. On `passed=true`: releases escrow to `treasury`. On `passed=false`: refunds buyer in full. Reverts on bad signer, expired attestation, planHash mismatch, or double-settle. Emits `Settled` / `Refunded`. |
| `claimRefund(bytes32 tripId)` | Traveller | Permissionless refund after `refundDeadline` (deposit + N days, e.g. 30) if never settled — the attester going dark can never trap funds. |

Config: `usdcToken`, `price`, `treasury`, `attester` (server key address),
`initialOwner`. Owner may `setPrice` (non-zero) and `setAttester` (key
rotation); treasury and token immutable. **No pause, no upgrade proxy** —
same auditability argument as the original TripPass.

The attester never sees or stores traveller data — it signs a verdict over
`planHash`, nothing else. Health data stays off-chain; the existing honesty
rules hold (a payment state is a real chain state or it isn't shown).

## Where the gate sits

The gate is the day-2 lock, not the door. Day 1 of the plan renders free in
full — value shown, trust earned — and days 2..N of `/review` (and the
`Now / The plan` switch on `/`) show the locked skeleton behind an unlock
card. The example journeys (`?example=*`) stay free forever — they are the
funnel, and gating a sample would be dishonest-adjacent.

## Implementation plan

### Phase 0 — contract (`contracts/`, new top-level dir)

Foundry scaffold (`foundry.toml`, `src/TripEscrow.sol`, `test/`).

- Write the four-function contract above + `getPrice` / `getEscrow`
  views + `Deposited` / `Settled` / `Refunded` / `PriceUpdated` events.
- EIP-712 domain: `{name:"MeridianTripEscrow", version:"1", chainId,
  verifyingContract}` — chainId bound so attestations can't replay across
  testnet/mainnet.
- `forge test`: deposit, AlreadyDeposited, settle-with-good-sig,
  settle-with-wrong-signer reverts, expired attestation reverts, refund
  before/after deadline, price=0 revert, double-settle reverts.
- Deploy to Arc testnet (USDC `0x3600…0000`). Verify on the explorer.

**Status 2026-11-02 — implemented, deployment pending.** `contracts/src/
TripEscrow.sol` on OZ v5.5.0 (`EIP712` + `ECDSA` + `SafeERC20` +
`Ownable`, solc 0.8.24), forge-std and openzeppelin as submodules under
`lib/` at repo root. 18/18 `forge test` green covering every row above
plus attester rotation, per-trip isolation, and post-settle refund
rejection. Note for Phase 1: `escrows[buyer][tripId]` lookup precedes the
attestation's tripId check, so a wrong-trip call reverts `NoEscrow`
before signature verification — order matters when reading revert codes.
Remaining: a funded Arc testnet deployer wallet, then deploy + verify.

### Phase 1 — attestation backend

- `src/domain/attestation.ts` — canonical plan-hash serialisation
  (stable JSON key order → keccak256) + EIP-712 typed-data builder.
  Pure functions, bun-tested.
- `POST /api/payments/attest` — body `{wallet, tripId, planId}`. The route:
  loads the persisted plan (`api/persistence/runs` shape), re-runs
  `evaluatePlan` on it — **the scorer is the oracle, never trust a client-
  reported verdict** — computes `planHash`, signs `{buyer, tripId, planHash,
  passed, expiry=now+1h}` with `ATTESTER_PRIVATE_KEY`, returns the typed
  data + signature. Replay-provider plans attest fine: the scorer's verdict
  is deterministic regardless of who drafted the plan — the attestation
  attests *the gate*, not agent provenance.
- `POST /api/payments/settle` — server relays `settle()` itself after
  signing (gas in USDC ~$0.001). Collapses the traveller's flow to two
  signatures: approve, deposit. The chain still enforces correctness — the
  relay can't settle without a valid attestation it just minted.
- Tests (`tests/attestation.test.ts`): golden EIP-712 vectors, failing-plan
  input produces `passed:false`, tampered planHash rejected by the contract
  side (forge side covers), attestation for a non-existent plan 404s.

**Status 2026-11-02 — implemented.** `src/domain/attestation.ts`
(canonical JSON → `planHashOf`, route-derived `tripIdOf`, EIP-712 types
pinned by a golden typehash in tests), `src/lib/plan-seals.ts` (in-memory
runId → seal registry, same liveness contract as the crew-run registry),
a `plan_seal` CrewEvent minted inside `orchestrate` at briefing time —
the only seam where the mid-run-adjusted adherence floor is in scope —
plus `/api/payments/attest` and `/api/payments/settle` (server relays the
settle call; the attester key doubles as relayer). `viem@2.57.12` added
(pinned below the same-day 2.57.14). Verified: 10 attestation tests,
1022/1022 suite, typecheck, lint — all green with every payment env var
unset.

**The retry-semantics question resolved.** `MAX_ATTEMPTS_PER_DAY = 2`;
a day that fails both attempts is dropped with a recoverable error and
the run continues — so a shipped plan only ever contains gate-passed
days. `passed:false` fires when the sealed input can no longer be
verified as passing: an edited plan (`use-plan-edit`), never a fresh
crew run. That keeps the guarantee honest — the refund path is real but
rare, and its trigger is post-lock plan drift, not crew failure.

**The fabrication hole closed by design.** The seal is minted
server-side inside `orchestrate`, keyed by runId in the same registry
that owns the event stream; the attester re-runs `evaluatePlan` over the
stored input and signs over `planHash`. A client can only ever attest a
plan the server saw gate. **Replay runs mint no seal** — `plan_seal`
lives in `orchestrate`, not the replay drain, because a scripted
transcript never gated anything. If a payments demo needs replay, mint
a seal in the demo runner instead, labelled as such.

**tripId derivation resolved:** route hash (origin, destination,
direction, requiredShiftMin, first/last plan date) — stable across
re-plans of the same journey, so one deposit covers regeneration.

### Phase 2 — frontend gate

- Dependency: `viem` only, via `window.ethereum`. No wagmi/RainbowKit yet —
  the app has no React Query and a 200-line wallet hook beats a dependency
  tree for a single flow. Revisit for embedded wallets (§Open questions).
- `src/lib/escrow.ts` — client wrapper: `readEscrow(buyer, tripId)`,
  `approve`, `deposit`, state machine.
- `src/components/UnlockCard.tsx` — the day-2 gate surface. States:
  `idle → approve-pending → confirming → deposit-pending → confirming →
  settling (server relay) → success | error`. **Success only after
  `readEscrow` returns settled on-chain — never from a tx hash alone.**
- Gate wiring in `/review` + the Today's plan switch: day 1 full, days 2..N
  collapsed behind `UnlockCard`. Honest states throughout: a pending tx is
  pending; nothing is claimed before `readEscrow` confirms it.
- Design law holds: terracotta is already the action accent, numbers in
  mono, the unlock card is a chrome surface not a stage. Ink only if it
  earns a stage.

**Status 2026-11-02 — implemented.** `src/lib/escrow.ts` (viem over
`window.ethereum` — connect, chain-switch/add, `readEscrow`, `readPrice`,
`approveUsdc`, `depositEscrow`, `waitTx`; USDC at the fixed Arc address
`0x3600…0000`), `src/components/UnlockCard.tsx` (the nine-state flow,
collapsing approve→deposit→server-relayed settle, success read back off
`readEscrow` — never the tx hash), wired into `PlanReview` so both hosts
(`/review` and Home's "The plan" switch) gate identically: day 1 renders,
days 2..N collapse behind the card. `page.tsx` attaches the `plan_seal`
to `meridian:lastPlan` so the gate knows the runId/tripId to deposit
against. Gate predicate: payments env set + wallet present + seal exists
+ more than one day — anything else renders open, never a dead card.
Verified: typecheck, lint, 1025/1025 — all with payment env unset.

### Phase 3 — flag, env, verification

**Current beta status:** payments are force-disabled at the app gate
(`paymentsEnabled()` / `paymentsConfigured()` return false even when env is
set), and both HTTP routes return 503 before config, signing or RPC. The
integration below is retained for a future, deliberately re-enabled release.

- ~~`NEXT_PUBLIC_PAYMENTS_ENABLED`~~ done — unset hides every payment
  surface (`paymentsAvailable()` returns false → no gate) and replay
  flows are untouched (no seal → no gate).
- Env (`.env.example` additions, landed 2026-11-02):
  - `NEXT_PUBLIC_ARC_RPC`, `NEXT_PUBLIC_TRIP_ESCROW_ADDRESS`,
    `NEXT_PUBLIC_ARC_CHAIN_ID`, `NEXT_PUBLIC_PAYMENTS_ENABLED`
  - `ARC_RPC`, `ATTESTER_PRIVATE_KEY`, `TRIP_ESCROW_ADDRESS`,
    `ARC_CHAIN_ID` (server-only — no `NEXT_PUBLIC_`, ever)
- Suite: `bun test`, typecheck, lint, `bun run build` — all green with
  the flag unset (1025/1025; both `/api/payments/*` routes register).
  Forge suite green (18/18).

**Design-evolution pass 2026-11-02.** After the deployment, four UX
gaps were closed in the same round: (1) price disclosed at intent —
`TripEntryScreen` reads `getPrice()` live and renders "Day one is free.
The full week is N USDC, held on Arc and released only if the plan
passes our checks — refunded if it doesn't" under the entry form; (2)
the no-wallet leak closed — the gate predicate is now env-only
(`paymentsConfigured`), and `UnlockCard` owns the no-wallet boundary
("unlock on a device with a browser wallet") instead of silently
rendering paid content on mobile; (3) locked days render as skeletons —
day label, bed/wake, step count visible, detail locked, so the shape of
the week sells the unlock; (4) traveller vocabulary on the card — held /
checked / released / refunded, never "escrow" or "attestation"; the
settle receipt links the Arc explorer; a 404 from settle (seal lost to a
server restart) names the 30-day claimRefund path rather than erroring
flatly. Still deferred from the same review: embedded wallet (the only
real fix for mobile payment), refund narrative on the arrival card, and
the paid-plan-lost-on-storage-wipe restore affordance.

**Deployed & exercised 2026-11-02 (Arc testnet, chain 5042002).**
Contract `0xdd5b9bb1527bc7e6fe058d9dacde2c7d9726f7b6` — price 1 USDC,
treasury/attester/owner = deployer `0x4d5dEa047d2f0073647856dc2Fdef70e780Ca693`,
refundWindow 30d, via `contracts/script/Deploy.s.sol`. Env wired in
`.env.local` (`NEXT_PUBLIC_PAYMENTS_ENABLED=1` + both address slots).
On-chain E2E proved the loop on the real deployment: `approve`
(0x04582c87) → `deposit` (0x3c5d55ab, `Deposited` emitted) → EIP-712
attestation signed in TS via viem → `settle` (0xa6d3d7e0, `Settled`
emitted) → `escrows()` reads `state=Settled`, 1 USDC to treasury. The
viem signing path is byte-compatible with the contract's typed-data
hash — the cross-language risk is retired. **Still open:** the app-
level E2E — a live crew run sealing a plan, `/api/payments/attest`
serving it, and the `passed:false` → refund branch (attested on the
forge side, unexercised on-chain).
- Docs: this file moves `docs/plan/` → `docs/reference/payments.md` when
  shipped; README route table gains the unlock behaviour then, not now —
  nothing user-facing exists until the contract is deployed and the flag
  is set.

## Deferred — noted, not planned

- **Crew agentic payments** (Jun pays per research call). Zero traveller
  friction and the most Arc-native story, but it needs a per-agent wallet
  and metered spending policy — a workstream, not a feature. Revisit after
  the escrow ships.
- **Sponsored pool** (`/team` — employer deposits, whitelists travellers).
  The real B2B shape; waits until the entitlement primitive exists to
  extend (`escrow[sponsor] → seats[]`).
- **Embedded wallet + fiat on-ramp** — the only thing that fixes the real
  onboarding friction. Evaluate Circle's wallet SDK once there's a reason
  to believe travellers pay at all.
- Adherence staking and NFT passports: rejected (gambling-adjacent
  mechanics; the share card already does the passport's job off-chain).

## Open questions

- Price per trip: Timeshifter anchors at $9.99/trip — `price` below that
  reads as a novelty fee, above it needs the outcome guarantee to carry
  real weight.
- Refund deadline length (30 days post-deposit? post-arrival?).
- ~~Does a `passed:false` plan ever reach the gate?~~ Resolved 2026-11-02:
  failed days are dropped, not shipped; `passed:false` keys off the sealed
  input's re-verification (post-lock edits), see Phase 1 status.
- ~~tripId derivation~~ Resolved: route hash, stable across re-plans.
