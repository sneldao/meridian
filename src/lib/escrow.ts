import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

// The traveller-facing half of TripEscrow: viem over window.ethereum, no
// wallet SDK. Every read goes to Arc RPC; success states are only ever
// claimed from readEscrow, never from a transaction hash alone. Mirrors the
// state machine in contracts/src/TripEscrow.sol — keep them in step.

/** Arc's USDC ERC-20 address — identical on testnet and mainnet. */
export const ARC_USDC = "0x3600000000000000000000000000000000000000" as const;

const ESCROW_ABI = parseAbi([
  "function deposit(bytes32 tripId) external",
  "function escrows(address buyer, bytes32 tripId) view returns (uint256 amount, uint256 depositedAt, uint8 state)",
  "function getPrice() view returns (uint256)",
]);
const ERC20_ABI = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

/** Matches contracts/src/TripEscrow.sol enum order. */
export const EscrowState = { None: 0, Held: 1, Settled: 2, Refunded: 3 } as const;

/** The deployment is configured for payments — env only, no wallet check.
 *  Drives the gate itself: a sealed plan on a configured deployment shows a
 *  gate even where no wallet exists, because the alternative is silently
 *  handing out paid content on mobile. The card decides what the gate says
 *  when there's no wallet to pay with. */
export function paymentsConfigured(): boolean {
  return false;
}

/** A wallet the traveller could actually pay with is present. */
export function walletAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as { ethereum?: unknown }).ethereum)
  );
}

function escrowAddress(): Address {
  return process.env.NEXT_PUBLIC_TRIP_ESCROW_ADDRESS as Address;
}

function arcChain() {
  return defineChain({
    id: Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID ?? "5042002"),
    name: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: {
      default: { http: [process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.io"] },
    },
    blockExplorers: {
      default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" },
    },
  });
}

function publicClient() {
  const chain = arcChain();
  return createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
}

function walletClient() {
  const ethereum = (window as { ethereum?: { request: (a: unknown) => Promise<unknown> } }).ethereum;
  if (!ethereum) throw new Error("no injected wallet");
  return createWalletClient({ chain: arcChain(), transport: custom(ethereum as never) });
}

/** Connect + land on Arc. Switches the wallet's chain, adding the network
 *  to wallets that don't know it yet. */
export async function connectWallet(): Promise<Address> {
  const ethereum = (window as { ethereum?: { request: (a: { method: string; params?: unknown }) => Promise<unknown> } }).ethereum;
  if (!ethereum) throw new Error("No wallet found — install a browser wallet to pay on Arc.");
  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as Address[];
  const chain = arcChain();
  const chainIdHex = `0x${chain.id.toString(16)}`;
  try {
    await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
  } catch (err) {
    // 4902 = the wallet doesn't know Arc — teach it, then switch.
    if ((err as { code?: number }).code === 4902) {
      await ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [chain.rpcUrls.default.http[0]],
            blockExplorerUrls: [chain.blockExplorers.default.url],
          },
        ],
      });
    } else {
      throw err;
    }
  }
  return accounts[0];
}

export async function readEscrow(buyer: Address, tripId: Hex) {
  const [amount, depositedAt, state] = await publicClient().readContract({
    address: escrowAddress(),
    abi: ESCROW_ABI,
    functionName: "escrows",
    args: [buyer, tripId],
  });
  return { amount, depositedAt, state: state as (typeof EscrowState)[keyof typeof EscrowState] };
}

export async function readPrice(): Promise<bigint> {
  return publicClient().readContract({
    address: escrowAddress(),
    abi: ESCROW_ABI,
    functionName: "getPrice",
  });
}

export async function approveUsdc(buyer: Address, amount: bigint): Promise<Hex> {
  return walletClient().writeContract({
    account: buyer,
    address: ARC_USDC,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [escrowAddress(), amount],
  });
}

export async function depositEscrow(buyer: Address, tripId: Hex): Promise<Hex> {
  return walletClient().writeContract({
    account: buyer,
    address: escrowAddress(),
    abi: ESCROW_ABI,
    functionName: "deposit",
    args: [tripId],
  });
}

export async function waitTx(hash: Hex): Promise<"success" | "reverted"> {
  const receipt = await publicClient().waitForTransactionReceipt({ hash });
  return receipt.status === "success" ? "success" : "reverted";
}
