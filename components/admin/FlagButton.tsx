"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Target = "clip" | "clipper";

export function FlagButton({
  target,
  id,
  flagged,
}: {
  target: Target;
  id: string;
  flagged: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function flag() {
    const reason = window.prompt(
      target === "clip"
        ? "Why flag this clip? (e.g. suspected botted views)"
        : "Why flag this user? (e.g. suspected bot account)",
    );
    if (!reason) return;
    setBusy(true);
    const path =
      target === "clip"
        ? `/api/admin/clips/${id}/flag`
        : `/api/admin/clippers/${id}/flag`;
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
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
      onClick={flag}
      disabled={busy}
      title={flagged ? "Add another flag for review" : "Flag for review"}
      className="font-mono text-[10px] uppercase tracking-widest text-admin hover:underline disabled:opacity-50"
    >
      {flagged ? "flagged ⚑" : "flag"}
    </button>
  );
}
