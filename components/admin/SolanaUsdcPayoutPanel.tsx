"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  type Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  USDC_DECIMALS,
  USDC_MINT,
  unitsToUsdcAmount,
  usdcAmountToUnits,
} from "@/lib/solana";

type Status = "idle" | "building" | "signing" | "confirming" | "recording" | "done" | "error";

// Poll signature status instead of using signatureSubscribe so the wallet
// adapter Connection works through our HTTP-only RPC proxy (no WS endpoint).
async function pollSignatureConfirmation(
  connection: Connection,
  signature: string,
  lastValidBlockHeight: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const start = Date.now();
  const timeoutMs = 90_000;
  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status) {
      if (status.err) {
        return { ok: false, error: `tx failed on-chain: ${JSON.stringify(status.err)}` };
      }
      if (
        status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized"
      ) {
        return { ok: true };
      }
    }
    const blockHeight = await connection.getBlockHeight();
    if (blockHeight > lastValidBlockHeight) {
      return { ok: false, error: "tx expired before confirmation" };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { ok: false, error: "timed out waiting for confirmation" };
}

export function SolanaUsdcPayoutPanel({
  clipperId,
  recipientWallet,
  suggestedAmount,
}: {
  clipperId: string;
  recipientWallet: string | null;
  suggestedAmount: number;
}) {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const [amount, setAmount] = useState(
    suggestedAmount > 0 ? suggestedAmount.toFixed(2) : "",
  );
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  const recipient = (() => {
    if (!recipientWallet) return null;
    try {
      return new PublicKey(recipientWallet);
    } catch {
      return null;
    }
  })();

  async function send() {
    setError(null);
    setTxSig(null);

    if (!recipient) {
      setError("clipper has no valid Solana wallet on file");
      return;
    }
    if (!publicKey || !connected) {
      setError("connect your wallet first");
      return;
    }

    let units: bigint;
    try {
      units = usdcAmountToUnits(amount);
    } catch {
      setError("invalid amount");
      return;
    }

    setStatus("building");
    try {
      const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipient);

      // Find a USDC token account owned by the sender. Most commonly this
      // is the standard ATA but we handle non-standard accounts too. We
      // use getParsedTokenAccountsByOwner so a transient RPC error throws
      // a clear message instead of being misread as "no token account".
      let senderAccounts;
      try {
        senderAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          mint: USDC_MINT,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus("error");
        setError(
          `couldn't read your USDC balance from RPC: ${msg}. ` +
            `Public RPC is rate-limited — set NEXT_PUBLIC_SOLANA_RPC_URL to a Helius/QuickNode endpoint and retry.`,
        );
        return;
      }

      if (senderAccounts.value.length === 0) {
        setStatus("error");
        setError("no USDC found in this wallet on this network");
        return;
      }

      // Pick an account with enough balance, preferring the standard ATA.
      const standardAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const sorted = [...senderAccounts.value].sort((a, b) => {
        const aIsAta = a.pubkey.equals(standardAta) ? 1 : 0;
        const bIsAta = b.pubkey.equals(standardAta) ? 1 : 0;
        return bIsAta - aIsAta;
      });
      const candidate = sorted.find((a) => {
        const bal = a.account.data.parsed.info.tokenAmount.amount as string;
        return BigInt(bal) >= units;
      });
      if (!candidate) {
        const totalUnits = senderAccounts.value.reduce(
          (s, a) =>
            s + BigInt(a.account.data.parsed.info.tokenAmount.amount as string),
          0n,
        );
        setStatus("error");
        setError(
          `insufficient USDC: have ${unitsToUsdcAmount(totalUnits)}, need ${amount}`,
        );
        return;
      }
      const sourceTokenAccount = candidate.pubkey;

      const instructions = [];

      // Create the recipient's USDC ATA if it doesn't exist (sender pays the rent ~0.002 SOL).
      let needCreate = false;
      try {
        await getAccount(connection, recipientAta);
      } catch {
        needCreate = true;
      }
      if (needCreate) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            publicKey,
            recipientAta,
            recipient,
            USDC_MINT,
          ),
        );
      }

      instructions.push(
        createTransferCheckedInstruction(
          sourceTokenAccount,
          USDC_MINT,
          recipientAta,
          publicKey,
          units,
          USDC_DECIMALS,
        ),
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions,
      }).compileToV0Message();
      const tx = new VersionedTransaction(messageV0);

      setStatus("signing");
      const signature = await sendTransaction(tx, connection);

      setStatus("confirming");
      const confirmResult = await pollSignatureConfirmation(
        connection,
        signature,
        lastValidBlockHeight,
      );
      if (!confirmResult.ok) {
        setStatus("error");
        setError(confirmResult.error);
        setTxSig(signature);
        return;
      }

      setTxSig(signature);
      setStatus("recording");
      const res = await fetch("/api/admin/payouts/solana/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clipper_id: clipperId,
          amount: Number(amount),
          signature,
          note: note || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setStatus("error");
        setError(`tx confirmed on-chain but server record failed: ${j.error ?? res.status}`);
        return;
      }

      setStatus("done");
      setNote("");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("error");
      setError(msg);
    }
  }

  const explorer = (sig: string) =>
    `https://solscan.io/tx/${sig}${process.env.NEXT_PUBLIC_SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""}`;

  const busy =
    status === "building" ||
    status === "signing" ||
    status === "confirming" ||
    status === "recording";

  return (
    <div className="border border-admin/30 p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="label">send USDC via wallet</span>
        <span className="font-mono text-[10px] text-text-3">
          mainnet · admin signs in browser · server verifies on-chain
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <WalletMultiButton />
          {publicKey && (
            <span className="font-mono text-xs text-text-2">
              {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
            </span>
          )}
        </div>
        <span className="font-mono text-xs">
          <span className="text-text-3">// recipient: </span>
          {recipientWallet ? (
            recipient ? (
              <span className="text-text-2">
                {recipientWallet.slice(0, 4)}…{recipientWallet.slice(-4)}
              </span>
            ) : (
              <span className="text-danger">invalid address</span>
            )
          ) : (
            <span className="text-danger">no wallet on file</span>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          id="sol-amount"
          label="amount (USDC)"
          required
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input
          id="sol-note"
          label="note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex items-end">
          <Button
            variant="primary"
            onClick={send}
            disabled={busy || !connected || !recipient || !amount}
          >
            {status === "building" && "Preparing tx…"}
            {status === "signing" && "Awaiting wallet…"}
            {status === "confirming" && "Confirming on-chain…"}
            {status === "recording" && "Recording payout…"}
            {(status === "idle" || status === "done" || status === "error") &&
              `Send $${amount || "0.00"} USDC`}
          </Button>
        </div>
      </div>

      {status === "done" && txSig && (
        <p className="font-mono text-xs text-accent">
          ✓ paid · tx{" "}
          <a
            href={explorer(txSig)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {txSig.slice(0, 8)}…
          </a>
        </p>
      )}
      {error && (
        <p className="font-mono text-xs text-danger break-all">
          {error}
          {txSig && (
            <>
              {" "}
              · tx{" "}
              <a
                href={explorer(txSig)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {txSig.slice(0, 8)}…
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
