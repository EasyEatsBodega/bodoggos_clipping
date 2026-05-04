"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function WalletForm({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string>();

  const trimmed = value.trim();
  const dirty = trimmed !== (initial ?? "");
  const looksValid = trimmed === "" || SOLANA_ADDRESS.test(trimmed);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(undefined);
    const res = await fetch("/api/profile/wallet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ solana_wallet: trimmed === "" ? null : trimmed }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to save");
      setState("error");
      return;
    }
    setState("saved");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="border-b border-border py-4 grid grid-cols-3 gap-6">
      <span className="label">solana wallet</span>
      <div className="col-span-2 flex flex-col gap-3">
        <Input
          id="solana_wallet"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setState("idle");
          }}
          placeholder="paste your solana address"
          spellCheck={false}
          autoComplete="off"
        />
        <p className="font-mono text-xs text-text-3">
          // payouts are sent to this address. base58, 32–44 chars. leave blank to unset.
        </p>
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            disabled={!dirty || !looksValid || state === "saving"}
          >
            {state === "saving" ? "Saving…" : "Save wallet"}
          </Button>
          {state === "saved" && !dirty && (
            <span className="font-mono text-xs text-accent">// saved</span>
          )}
          {!looksValid && (
            <span className="font-mono text-xs text-danger">
              // not a valid solana address
            </span>
          )}
          {error && <span className="font-mono text-xs text-danger">// {error}</span>}
        </div>
      </div>
    </form>
  );
}
