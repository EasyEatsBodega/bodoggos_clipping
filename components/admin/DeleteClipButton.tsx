"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteClipButton({ clipId }: { clipId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (
      !window.confirm(
        "Permanently delete this clip? Its impressions will be removed from all totals. This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/clips/${clipId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed");
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
      delete
    </button>
  );
}
