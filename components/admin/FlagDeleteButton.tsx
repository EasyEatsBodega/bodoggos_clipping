"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FlagDeleteButton({
  kind,
  flagId,
}: {
  kind: "clip" | "clipper";
  flagId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!window.confirm("Delete this flag entry? This removes it from history.")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/flags/${kind}/${flagId}`, { method: "DELETE" });
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
      className="font-mono text-[10px] uppercase tracking-widest text-text-3 hover:underline disabled:opacity-50"
    >
      delete
    </button>
  );
}
