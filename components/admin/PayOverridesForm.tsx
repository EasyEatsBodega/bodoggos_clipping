"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function PayOverridesForm({
  clipperId,
  initial,
  campaignDefaults,
}: {
  clipperId: string;
  initial: {
    flat_fee_per_clip: string;
    cpm_rate_override: string | null;
    max_payout_override: string | null;
  };
  campaignDefaults: {
    cpm_rate: string;
    max_payout_per_clip: string;
  };
}) {
  const router = useRouter();
  const [flat, setFlat] = useState(Number(initial.flat_fee_per_clip).toFixed(2));
  const [cpm, setCpm] = useState(
    initial.cpm_rate_override != null ? Number(initial.cpm_rate_override).toFixed(2) : "",
  );
  const [cap, setCap] = useState(
    initial.max_payout_override != null ? Number(initial.max_payout_override).toFixed(2) : "",
  );
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setOk(false);
    setError(null);
    const res = await fetch(`/api/admin/clippers/${clipperId}/pay-overrides`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        flat_fee_per_clip: Number(flat) || 0,
        cpm_rate_override: cpm.trim() === "" ? null : Number(cpm),
        max_payout_override: cap.trim() === "" ? null : Number(cap),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed");
      return;
    }
    setOk(true);
    router.refresh();
  }

  const effectiveCpm = cpm.trim() === "" ? Number(campaignDefaults.cpm_rate) : Number(cpm);
  const effectiveCap = cap.trim() === "" ? Number(campaignDefaults.max_payout_per_clip) : Number(cap);
  const effectiveFlat = Number(flat) || 0;

  return (
    <form
      onSubmit={submit}
      className="border border-admin/30 p-5 flex flex-col gap-4"
    >
      <div className="flex items-baseline justify-between">
        <span className="label">payout overrides</span>
        <span className="font-mono text-[10px] text-text-3">
          admin only · applies to FUTURE clips submitted after save
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          id="flat"
          label="flat fee per clip (usd)"
          type="number"
          step="0.01"
          min="0"
          value={flat}
          onChange={(e) => setFlat(e.target.value)}
          placeholder="0.00"
        />
        <Input
          id="cpm-override"
          label={`cpm override (default $${Number(campaignDefaults.cpm_rate).toFixed(2)})`}
          type="number"
          step="0.01"
          min="0"
          value={cpm}
          onChange={(e) => setCpm(e.target.value)}
          placeholder="leave blank for default"
        />
        <Input
          id="cap-override"
          label={`max per clip override (default $${Number(campaignDefaults.max_payout_per_clip).toFixed(2)})`}
          type="number"
          step="0.01"
          min="0"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          placeholder="leave blank for default"
        />
      </div>
      <p className="font-mono text-[10px] text-text-2">
        <span className="text-text-3">// effective deal: </span>
        ${effectiveFlat.toFixed(2)} per clip + ${effectiveCpm.toFixed(2)} CPM, capped at $
        {effectiveCap.toFixed(2)}
      </p>
      <div className="flex items-center gap-3">
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save overrides"}
        </Button>
        {ok && <span className="font-mono text-xs text-accent">saved</span>}
        {error && <span className="font-mono text-xs text-danger">{error}</span>}
      </div>
    </form>
  );
}
