"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Clipper-level innocent verdict on the bot review page: marks all of the
// clipper's current clips as reviewed/not-botting so the clipper drops off
// the suspect rollup. Future clips are still scored normally.
export function ReviewDismissClipperButton({
  clipperId,
  handle,
}: {
  clipperId: string;
  handle: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function dismiss() {
    if (
      !window.confirm(
        `Clear @${handle} from bot review?\n\nMarks ALL their current clips as reviewed / not botting — they drop off this list and won't be re-flagged. New clips they submit are still scored normally.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/clippers/${clipperId}/review-dismiss`, {
      method: "POST",
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed to clear clipper");
      return;
    }
    router.refresh();
  }

  return (
    <button
      onClick={dismiss}
      disabled={busy}
      title="Mark all their current clips as reviewed — removes the clipper from this list"
      className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline disabled:opacity-50"
    >
      {busy ? "…" : "clear clipper"}
    </button>
  );
}
