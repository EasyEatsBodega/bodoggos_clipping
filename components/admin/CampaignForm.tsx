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

// Slugs must match /^[a-z0-9][a-z0-9-]*$/ server-side. Sanitize while typing
// (lowercase, spaces → dashes, drop everything else) so pasting a campaign
// name like "BoDoggos Writer Campaign" just works instead of 400ing.
function sanitizeSlugInput(v: string): string {
  return v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// Final cleanup at submit: collapse runs of dashes and trim the ends (a
// trailing dash is allowed while typing so "foo-bar" can be entered).
function finalizeSlug(v: string): string {
  return v.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
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
    pay_structure:
      c?.weekly_base_pay_usd != null ? ("weekly_base" as const) : ("per_clip" as const),
    weekly_base_pay_usd: c?.weekly_base_pay_usd != null ? Number(c.weekly_base_pay_usd) : "",
    cpm_rate: c ? Number(c.cpm_rate) : 4,
    max_payout_per_clip: c ? Number(c.max_payout_per_clip) : 75,
    tracking_days: c?.tracking_days ?? 7,
    min_views: c?.min_views != null ? Number(c.min_views) : "",
    allow_external_authors: c?.allow_external_authors ?? false,
    active: c?.active ?? false,
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

    const weekly = form.pay_structure === "weekly_base";
    const payload: Record<string, unknown> = {
      name: form.name,
      cpm_rate: Number(form.cpm_rate),
      max_payout_per_clip: Number(form.max_payout_per_clip),
      tracking_days: Number(form.tracking_days),
      // The min-views floor also gates the flat fee on the clip carrying the
      // weekly base, which would silently forfeit the retainer — so weekly-
      // base campaigns never set one.
      min_views: weekly || form.min_views === "" ? null : Number(form.min_views),
      weekly_base_pay_usd:
        weekly && form.weekly_base_pay_usd !== "" ? Number(form.weekly_base_pay_usd) : null,
      allow_external_authors: form.allow_external_authors,
      active: form.active,
      description: form.description ? form.description : null,
      brief_url: form.brief_url ? form.brief_url : null,
      starts_at: fromLocalInput(form.starts_at),
      ends_at: fromLocalInput(form.ends_at),
      budget_usd: form.budget_usd === "" ? null : Number(form.budget_usd),
    };
    if (!editing) payload.slug = finalizeSlug(form.slug);

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
          label="slug (lowercase-dashes, immutable)"
          required
          placeholder="brand-name-q1"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: sanitizeSlugInput(e.target.value) })}
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
      <fieldset className="flex flex-col gap-2">
        <legend className="label">pay structure</legend>
        <div className="flex flex-col gap-1 font-mono text-xs">
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="pay_structure"
              className="mt-[2px]"
              checked={form.pay_structure === "per_clip"}
              onChange={() => setForm({ ...form, pay_structure: "per_clip" })}
            />
            <span className="flex flex-col gap-0.5">
              <span>per clip (cpm)</span>
              <span className="text-text-3">each clip earns cpm × views, capped per clip</span>
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="pay_structure"
              className="mt-[2px]"
              checked={form.pay_structure === "weekly_base"}
              onChange={() => setForm({ ...form, pay_structure: "weekly_base" })}
            />
            <span className="flex flex-col gap-0.5">
              <span>flat weekly base pay</span>
              <span className="text-text-3">
                a flat usd amount per week — paid with the first counting post each week
                (mon–sun ET). impressions are still tracked; set cpm &gt; 0 to add a
                per-view bonus on top, or 0 for base pay only. per-clipper per-clip flat
                fees don&apos;t apply in this mode.
              </span>
            </span>
          </label>
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-4">
        {form.pay_structure === "weekly_base" && (
          <Input
            id="weekly_base"
            label="weekly base pay (usd / week)"
            required
            type="number"
            step="0.01"
            min="0.01"
            value={form.weekly_base_pay_usd}
            onChange={(e) =>
              setForm({
                ...form,
                weekly_base_pay_usd: e.target.value === "" ? "" : Number(e.target.value),
              })
            }
          />
        )}
        <Input
          id="cpm"
          label={
            form.pay_structure === "weekly_base"
              ? "cpm bonus (usd / 1k, 0 = none)"
              : "cpm (usd / 1k)"
          }
          required
          type="number"
          step="0.01"
          min={form.pay_structure === "weekly_base" ? "0" : "0.01"}
          value={form.cpm_rate}
          onChange={(e) => setForm({ ...form, cpm_rate: Number(e.target.value) })}
        />
        <Input
          id="cap"
          label={
            form.pay_structure === "weekly_base"
              ? "cpm bonus cap / clip (usd)"
              : "max payout / clip (usd)"
          }
          required
          type="number"
          step="0.01"
          min="0"
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
        {form.pay_structure === "per_clip" && (
          <Input
            id="min_views"
            label="min views to earn (blank = no floor)"
            type="number"
            step="1"
            min="0"
            value={form.min_views}
            onChange={(e) =>
              setForm({
                ...form,
                min_views: e.target.value === "" ? "" : Number(e.target.value),
              })
            }
          />
        )}
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
      <label className="flex items-start gap-2 font-mono text-xs">
        <input
          type="checkbox"
          className="mt-[2px]"
          checked={form.allow_external_authors}
          onChange={(e) => setForm({ ...form, allow_external_authors: e.target.checked })}
        />
        <span className="flex flex-col gap-0.5">
          <span>ghostwriting — allow posts from other X accounts</span>
          <span className="text-text-3">
            clippers can submit posts published on any X account, not just their linked
            handle (e.g. posts they wrote that went out on someone else&apos;s account)
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 font-mono text-xs">
        <input
          type="checkbox"
          className="mt-[2px]"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
        <span className="flex flex-col gap-0.5">
          <span>publish to clippers</span>
          <span className="text-text-3">
            unchecked = draft, visible only to admins until you publish
          </span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <Button variant="primary" type="submit" disabled={busy}>
          {busy
            ? "Saving…"
            : editing
              ? "Save"
              : form.active
                ? "Create & publish"
                : "Save as draft"}
        </Button>
        {ok && editing && <span className="font-mono text-xs text-accent">saved</span>}
        {error && <span className="font-mono text-xs text-danger">{error}</span>}
      </div>
    </form>
  );
}
