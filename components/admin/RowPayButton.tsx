"use client";

import { useEffect, useState } from "react";
import { SolanaUsdcPayoutPanel } from "./SolanaUsdcPayoutPanel";

// Per-row pay action shown on the clippers list. Clicking opens an inline
// modal with the existing Solana payout panel pre-filled with the rolling
// owed amount, so admins can pay without drilling into each clipper page.
export function RowPayButton({
  clipperId,
  handle,
  recipientWallet,
  owedCents,
}: {
  clipperId: string;
  handle: string;
  recipientWallet: string | null;
  owedCents: number;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const canPay = !!recipientWallet && owedCents > 0;
  const suggestedAmount = owedCents / 100;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canPay}
        className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1 border ${
          canPay
            ? "border-admin text-admin hover:bg-admin/10"
            : "border-border text-text-3 cursor-not-allowed"
        }`}
        title={
          !recipientWallet
            ? "no wallet on file"
            : owedCents === 0
              ? "nothing owed"
              : `pay $${suggestedAmount.toFixed(2)} via Solana`
        }
      >
        pay
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            className="bg-bg border border-admin/40 max-w-3xl w-full mt-12 p-6 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-baseline justify-between">
              <div className="flex flex-col gap-1">
                <span className="label">pay @{handle}</span>
                <span className="font-mono text-xs text-text-2">
                  rolling owed: ${suggestedAmount.toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="font-mono text-[10px] uppercase tracking-widest text-text-3 hover:text-text"
              >
                close ✕
              </button>
            </div>
            <SolanaUsdcPayoutPanel
              clipperId={clipperId}
              recipientWallet={recipientWallet}
              suggestedAmount={suggestedAmount}
            />
          </div>
        </div>
      )}
    </>
  );
}
