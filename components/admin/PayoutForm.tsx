"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const CHAINS = ["Base", "Ethereum", "Polygon", "Arbitrum", "Optimism", "Solana"];

export function PayoutForm({
  clipperId,
  suggestedAmount,
}: {
  clipperId: string;
  suggestedAmount: number;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState(suggestedAmount > 0 ? suggestedAmount.toFixed(2) : "");
  const [chain, setChain] = useState("Base");
  const [tx, setTx] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch("/api/admin/payouts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clipper_id: clipperId,
        amount: Number(amount),
        chain,
        tx_hash: tx || undefined,
        note: note || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed");
      return;
    }
    setTx("");
    setNote("");
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="border border-admin/30 p-5 flex flex-col gap-4"
    >
      <div className="flex items-baseline justify-between">
        <span className="label">record payout</span>
        <span className="font-mono text-[10px] text-text-3">
          USDC manual send → log here
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Input
          id="amount"
          label="amount (USD)"
          required
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <label className="flex flex-col gap-2">
          <span className="label">chain</span>
          <select
            className="input-bare"
            value={chain}
            onChange={(e) => setChain(e.target.value)}
          >
            {CHAINS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <Input
          id="tx"
          label="tx hash (optional)"
          value={tx}
          onChange={(e) => setTx(e.target.value)}
          placeholder="0x…"
        />
        <Input
          id="note"
          label="note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" type="submit" disabled={busy || !amount}>
          {busy ? "Recording…" : "Mark paid"}
        </Button>
        {error && <span className="font-mono text-xs text-danger">{error}</span>}
      </div>
    </form>
  );
}
