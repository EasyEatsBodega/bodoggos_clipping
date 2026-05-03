"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { Campaign } from "@/lib/db-types";

export function ConfigForm({ campaign }: { campaign: Campaign }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: campaign.name,
    cpm_rate: Number(campaign.cpm_rate),
    max_payout_per_clip: Number(campaign.max_payout_per_clip),
    tracking_days: campaign.tracking_days,
    active: campaign.active,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);
    const res = await fetch(`/api/admin/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
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

  return (
    <form onSubmit={submit} className="border border-border p-5 flex flex-col gap-4 max-w-xl">
      <Input
        id="name"
        label="campaign name"
        required
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <Input
        id="cpm"
        label="cpm rate (usd per 1k impressions)"
        required
        type="number"
        step="0.01"
        min="0.01"
        value={form.cpm_rate}
        onChange={(e) => setForm({ ...form, cpm_rate: Number(e.target.value) })}
      />
      <Input
        id="cap"
        label="max payout per clip (usd)"
        required
        type="number"
        step="0.01"
        min="0.01"
        value={form.max_payout_per_clip}
        onChange={(e) => setForm({ ...form, max_payout_per_clip: Number(e.target.value) })}
      />
      <Input
        id="days"
        label="tracking days"
        required
        type="number"
        min="1"
        max="90"
        value={form.tracking_days}
        onChange={(e) => setForm({ ...form, tracking_days: Number(e.target.value) })}
      />
      <div className="flex items-center gap-3">
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        {ok && <span className="font-mono text-xs text-accent">saved</span>}
        {error && <span className="font-mono text-xs text-danger">{error}</span>}
      </div>
    </form>
  );
}
