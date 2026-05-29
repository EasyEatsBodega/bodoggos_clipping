"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeletePayoutButton({
  payoutId,
  handle,
  amount,
}: {
  payoutId: string;
  handle: string;
  amount: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (
      !window.confirm(
        `Remove the $${amount} payout to @${handle}? This will recalculate their outstanding balance as if the payment never happened. Cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/payouts/${payoutId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed to remove payout");
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={del}
      disabled={busy}
      className="font-mono text-[10px] uppercase tracking-widest text-danger hover:underline disabled:opacity-50"
    >
      remove
    </button>
  );
}
