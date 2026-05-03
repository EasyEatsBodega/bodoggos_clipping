"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function BanToggle({ clipperId, initial }: { clipperId: string; initial: boolean }) {
  const router = useRouter();
  const [banned, setBanned] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !banned;
    let reason: string | null = null;
    if (next) {
      reason = window.prompt("Reason for ban?") ?? "";
      if (!reason) return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/clippers/${clipperId}/ban`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ banned: next, reason: reason ?? undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error ?? "Failed");
      return;
    }
    setBanned(next);
    router.refresh();
  }

  return (
    <Button variant={banned ? "ghost" : "danger"} onClick={toggle} disabled={busy}>
      {banned ? "Unban" : "Ban"}
    </Button>
  );
}
