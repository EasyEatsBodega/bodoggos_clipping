"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { Campaign } from "@/lib/db-types";

type Props = { mode: "create" } | { mode: "edit"; campaign: Campaign };

// Strips trailing :ssZ etc — <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm"
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

export function CampaignForm(props: Props) {
  const router = useRouter();
  const editing = props.mode === "edit";
  const c = editing ? props.campaign : null;

  const [form, setForm] = useState({
    slug: c?.slug ?? "",
    name: c?.name ?? "",
    description: c?.description ?? "",
    brief_url: c?.brief_url ?? "",
    cpm_rate: c ? Number(c.cpm_rate) : 4,
    max_payout_per_clip: c ? Number(c.max_payout_per_clip) : 75,
    tracking_days: c?.tracking_days ?? 7,
    active: c?.active ?? true,
    starts_at: toLocalInput(c?.starts_at ?? null),
    ends_at: toLocalInput(c?.ends_at ?? null),
    budget_usd: c?.budget_usd != null ? Number(c.budget_usd) : "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(false);

    const payload: Record<string, unknown> = {
      name: form.name,
      cpm_rate: Number(form.cpm_rate),
      max_payout_per_clip: Number(form.max_payout_per_clip),
      tracking_days: Number(form.tracking_days),
      active: form.active,
      description: form.description ? form.description : null,
      brief_url: form.brief_url ? form.brief_url : null,
      starts_at: fromLocalInput(form.starts_at),
      ends_at: fromLocalInput(form.ends_at),
      budget_usd: form.budget_usd === "" ? null : Number(form.budget_usd),
    };
    if (!editing) payload.slug = form.slug;

    const res = await fetch(
      editing ? `/api/admin/campaigns/${c!.id}` : "/api/admin/campaigns",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed");
      return;
    }
    setOk(true);
    if (editing) {
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      const newId = j.campaign?.id;
      if (newId) router.push(`/admin/campaigns/${newId}`);
      else router.push("/admin/campaigns");
    }
  }

  return (
    <form onSubmit={submit} className="border border-border p-5 flex flex-col gap-4 max-w-2xl">
      {!editing && (
        <Input
          id="slug"
          label="slug (url-safe, immutable)"
          required
          placeholder="brand-name-q1"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
        />
      )}
      {editing && (
        <div className="font-mono text-[11px] text-text-3">
          slug: <span className="text-text-2">{c!.slug}</span>
        </div>
      )}
      <Input
        id="name"
        label="campaign name"
        required
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
      />
      <label className="flex flex-col gap-1">
        <span className="label">description (short, shown on card)</span>
        <textarea
          className="input-bare min-h-[60px]"
          maxLength={500}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>
      <Input
        id="brief_url"
        label="brief url (google doc / notion / etc — clippers can open)"
        type="url"
        placeholder="https://docs.google.com/..."
        value={form.brief_url}
        onChange={(e) => setForm({ ...form, brief_url: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-4">
        <Input
          id="cpm"
          label="cpm (usd / 1k)"
          required
          type="number"
          step="0.01"
          min="0.01"
          value={form.cpm_rate}
          onChange={(e) => setForm({ ...form, cpm_rate: Number(e.target.value) })}
        />
        <Input
          id="cap"
          label="max payout / clip (usd)"
          required
          type="number"
          step="0.01"
          min="0.01"
          value={form.max_payout_per_clip}
          onChange={(e) =>
            setForm({ ...form, max_payout_per_clip: Number(e.target.value) })
          }
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
        <Input
          id="budget"
          label="total budget (usd, blank = uncapped)"
          type="number"
          step="0.01"
          min="0"
          value={form.budget_usd}
          onChange={(e) =>
            setForm({
              ...form,
              budget_usd: e.target.value === "" ? "" : Number(e.target.value),
            })
          }
        />
        <Input
          id="starts_at"
          label="starts at (local time, blank = now)"
          type="datetime-local"
          value={form.starts_at}
          onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
        />
        <Input
          id="ends_at"
          label="ends at (local time, blank = no end)"
          type="datetime-local"
          value={form.ends_at}
          onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 font-mono text-xs">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
        active (visible to clippers)
      </label>
      <div className="flex items-center gap-3">
        <Button variant="primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save" : "Create campaign"}
        </Button>
        {ok && editing && <span className="font-mono text-xs text-accent">saved</span>}
        {error && <span className="font-mono text-xs text-danger">{error}</span>}
      </div>
    </form>
  );
}
