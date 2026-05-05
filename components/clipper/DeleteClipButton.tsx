"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteClipButton({
  clipId,
  redirectTo,
}: {
  clipId: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (
      !window.confirm(
        "Delete this clip? It will stop tracking and any earnings on it will be removed. This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/clips/${clipId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed to delete");
      return;
    }
    if (redirectTo) {
      router.replace(redirectTo as never);
    } else {
      router.refresh();
    }
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
