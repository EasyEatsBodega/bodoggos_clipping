import { PublicKey } from "@solana/web3.js";

// USDC mint addresses. Mainnet by default; can be overridden via env if
// you ever want to point at devnet USDC for testing.
const MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT || MAINNET_USDC,
);

// USDC has 6 decimals on Solana.
export const USDC_DECIMALS = 6;

// Browser RPC. If NEXT_PUBLIC_SOLANA_RPC_URL is set we hit that endpoint
// directly (e.g. a Helius URL the user is OK shipping in the bundle).
// Otherwise resolveBrowserRpcUrl() returns our server-side proxy at
// /api/solana/rpc, which forwards to SOLANA_RPC_URL using the server-only
// key. We resolve at call time so the URL tracks window.location.origin
// (works on localhost, preview deploys, prod) without needing extra env vars.
export const SOLANA_PROXY_PATH = "/api/solana/rpc";

export function resolveBrowserRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (explicit) return explicit;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${SOLANA_PROXY_PATH}`;
  }
  // SSR fallback — never actually used by the wallet adapter (client-only),
  // but Connection's constructor needs a parseable URL during render.
  return `http://localhost:3000${SOLANA_PROXY_PATH}`;
}

// Server-side RPC. Defaults to the public mainnet endpoint, but production
// should set SOLANA_RPC_URL to a Helius/QuickNode/Triton URL with an API key.
export const SOLANA_RPC_URL_SERVER =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

export const SOLANA_NETWORK =
  process.env.NEXT_PUBLIC_SOLANA_NETWORK || "mainnet-beta";

// Convert a USD-string ("12.34") or number to integer USDC token units (6 decimals).
export function usdcAmountToUnits(amount: number | string): bigint {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`invalid USDC amount: ${amount}`);
  }
  // Use string math via cents → micro to avoid float drift.
  const micro = Math.round(n * 1_000_000);
  return BigInt(micro);
}

// Inverse: integer USDC units → "12.34"
export function unitsToUsdcAmount(units: bigint | number | string): string {
  const u = typeof units === "bigint" ? units : BigInt(units);
  const negative = u < 0n;
  const abs = negative ? -u : u;
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  // Round to 2 decimals for display alignment with our payouts table.
  const cents = Math.round(Number(frac) / 10_000);
  const wholeStr = whole.toString();
  return `${negative ? "-" : ""}${wholeStr}.${cents.toString().padStart(2, "0")}`;
}
