"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OverrideClipButton({ clipId, current }: { clipId: string; current: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function override() {
    const v = window.prompt(
      `Override impressions (current: ${current}). Enter new count:`,
      String(current),
    );
    if (v == null) return;
    const next = Number(v);
    if (!Number.isFinite(next) || next < 0 || !Number.isInteger(next)) {
      alert("Must be a non-negative integer");
      return;
    }
    const reason = window.prompt("Reason for override?");
    if (!reason) return;
    setBusy(true);
    const res = await fetch(`/api/admin/clips/${clipId}/override`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ impressions: next, reason }),
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
      onClick={override}
      disabled={busy}
      className="font-mono text-[10px] uppercase tracking-widest text-admin hover:underline disabled:opacity-50"
    >
      override
    </button>
  );
}
