"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TaxRowState = "none" | "requested" | "submitted" | "cleared";

// Compact tax cell for the admin clippers list: shows the clipper's tax state
// for the year and lets an admin request (or re-send a request for) their info.
export function TaxRequestButton({
  clipperId,
  state,
}: {
  clipperId: string;
  state: TaxRowState;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function request() {
    setBusy(true);
    const res = await fetch(`/api/admin/clippers/${clipperId}/tax-request`, { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  if (state === "cleared") {
    return <span className="font-mono text-[10px] uppercase tracking-widest text-accent">cleared</span>;
  }
  if (state === "submitted") {
    return <span className="font-mono text-[10px] uppercase tracking-widest text-admin">submitted</span>;
  }
  return (
    <button
      onClick={request}
      disabled={busy}
      className="font-mono text-[10px] uppercase tracking-widest text-text-2 hover:text-admin disabled:opacity-50"
      title={state === "requested" ? "re-send the request" : "ask this clipper to submit tax info"}
    >
      {busy ? "…" : state === "requested" ? "requested ↻" : "request"}
    </button>
  );
}
