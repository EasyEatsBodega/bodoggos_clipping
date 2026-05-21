"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function EnrollCampaignButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enroll() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/campaigns/${campaignId}/enroll`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Enroll failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="primary" onClick={enroll} disabled={busy}>
        {busy ? "Enrolling…" : "Enroll in campaign"}
      </Button>
      {error && <span className="font-mono text-xs text-danger">{error}</span>}
    </div>
  );
}
