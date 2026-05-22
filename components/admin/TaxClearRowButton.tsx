"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TaxComplianceState } from "@/lib/queries";

// Compact clear / revoke action for the admin tax compliance table.
export function TaxClearRowButton({
  clipperId,
  state,
}: {
  clipperId: string;
  state: TaxComplianceState;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(method: "POST" | "DELETE") {
    setBusy(true);
    const res = await fetch(`/api/admin/clippers/${clipperId}/tax-clear`, { method });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  if (state === "needs_submission") {
    return <span className="font-mono text-[10px] text-text-3">awaiting clipper</span>;
  }
  if (state === "cleared") {
    return (
      <button
        onClick={() => act("DELETE")}
        disabled={busy}
        className="font-mono text-[10px] uppercase tracking-widest text-text-3 hover:text-danger disabled:opacity-50"
      >
        {busy ? "…" : "revoke"}
      </button>
    );
  }
  return (
    <button
      onClick={() => act("POST")}
      disabled={busy}
      className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline disabled:opacity-50"
    >
      {busy ? "…" : "clear for payment"}
    </button>
  );
}
