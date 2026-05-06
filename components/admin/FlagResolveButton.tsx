"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FlagResolveButton({
  kind,
  flagId,
}: {
  kind: "clip" | "clipper";
  flagId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resolve() {
    const resolution = window.prompt("Resolution note? (optional)") ?? "";
    setBusy(true);
    const res = await fetch(`/api/admin/flags/${kind}/${flagId}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolution: resolution || undefined }),
    });
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
      onClick={resolve}
      disabled={busy}
      className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline disabled:opacity-50"
    >
      resolve
    </button>
  );
}
