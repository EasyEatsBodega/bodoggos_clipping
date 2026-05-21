"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function PublishCampaignButton({
  campaignId,
  active,
}: {
  campaignId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (active) {
      const ok = confirm("Unpublish this campaign? Clippers won't see it until you publish again.");
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/campaigns/${campaignId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant={active ? "ghost" : "primary"} onClick={toggle} disabled={busy}>
        {busy ? "…" : active ? "Unpublish" : "Publish to clippers"}
      </Button>
      {error && <span className="font-mono text-xs text-danger">{error}</span>}
    </div>
  );
}
