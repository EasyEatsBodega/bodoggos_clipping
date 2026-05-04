"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RejectClipButton({
  clipId,
  status,
}: {
  clipId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (status === "rejected") {
    return (
      <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
        rejected
      </span>
    );
  }

  async function reject() {
    const reason = window.prompt("Reason for rejection?");
    if (!reason) return;
    if (!window.confirm("Reject this clip? Earnings will be cleared.")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/clips/${clipId}/reject`, {
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
      onClick={reject}
      disabled={busy}
      className="font-mono text-[10px] uppercase tracking-widest text-danger hover:underline disabled:opacity-50"
    >
      reject
    </button>
  );
}
