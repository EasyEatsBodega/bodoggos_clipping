"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "Innocent" verdict on the bot review page: marks the clip as reviewed/not
// botting so it drops off the suspect lists and won't be re-flagged by the
// nightly cron. Counterpart to BottingButton's guilty verdict.
export function ReviewDismissButton({ clipId }: { clipId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function dismiss() {
    setBusy(true);
    const res = await fetch(`/api/admin/clips/${clipId}/review-dismiss`, {
      method: "POST",
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed to dismiss");
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={dismiss}
      disabled={busy}
      title="Mark as reviewed — removes from this list and prevents re-flagging"
      className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline disabled:opacity-50"
    >
      {busy ? "…" : "not botting"}
    </button>
  );
}
