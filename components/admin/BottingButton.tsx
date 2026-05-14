"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Toggle a clip's "suspected engagement farming" mark. Marked clips stay
// in the system and keep tracking impressions but are excluded from
// payouts.
export function BottingButton({
  clipId,
  suspected,
  currentReason,
}: {
  clipId: string;
  suspected: boolean;
  currentReason?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function mark() {
    const reason = window.prompt(
      "Why do you suspect engagement farming on this clip? (this is shown on the report you send to the clipper)",
      currentReason ?? "",
    );
    if (!reason || !reason.trim()) return;
    setBusy(true);
    const res = await fetch(`/api/admin/clips/${clipId}/botting`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed");
      return;
    }
    router.refresh();
  }

  async function clear() {
    if (!window.confirm("Clear the suspected-botting mark? Payouts will resume for this clip.")) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/clips/${clipId}/botting`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed");
      return;
    }
    router.refresh();
  }

  if (suspected) {
    return (
      <button
        onClick={clear}
        disabled={busy}
        title={currentReason ?? "Suspected engagement farming — click to clear"}
        className="font-mono text-[10px] uppercase tracking-widest text-danger hover:underline disabled:opacity-50"
      >
        botting ✕
      </button>
    );
  }
  return (
    <button
      onClick={mark}
      disabled={busy}
      title="Mark as suspected engagement farming (excludes from payouts)"
      className="font-mono text-[10px] uppercase tracking-widest text-text-2 hover:text-danger hover:underline disabled:opacity-50"
    >
      botting?
    </button>
  );
}
