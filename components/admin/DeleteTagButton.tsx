"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteTagButton({ tagId, label, usage }: { tagId: string; label: string; usage: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    const msg =
      usage > 0
        ? `Delete "${label}"? This will remove the tag from ${usage} clip${usage === 1 ? "" : "s"}.`
        : `Delete "${label}"?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/tags/${tagId}`, { method: "DELETE" });
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
