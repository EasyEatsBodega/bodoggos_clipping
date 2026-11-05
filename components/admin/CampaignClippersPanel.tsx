"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// One enrolled clipper's rates in this campaign. `own` holds the rates set
// for them here (null = not set); `inherited` is what applies when a field
// is left blank (their clipper-wide deal, else the campaign default).
export type CampaignClipperRow = {
  clipperId: string;
  xHandle: string;
  banned: boolean;
  rosterActive: boolean;
  enrolledAt: string;
  clipCount: number;
  own: {
    weekly_base_pay_usd: string | null;
    cpm_rate: string | null;
    max_payout_per_clip: string | null;
    sponsored_bonus_usd: string | null;
  };
  inherited: {
    weeklyBasePay: number | null;
    cpmRate: number;
    maxPayoutPerClip: number;
    sponsoredBonus: number;
    // Which inherited values come from the clipper's account-wide deal
    // rather than the campaign default.
    fromDeal: { cpm: boolean; cap: boolean; sponsored: boolean };
  };
};

export function CampaignClippersPanel({
  campaignId,
  weeklyMode,
  rows,
  addable,
}: {
  campaignId: string;
  // Weekly-base campaign: show the weekly base column.
  weeklyMode: boolean;
  rows: CampaignClipperRow[];
  // Clippers not yet enrolled, for the add picker.
  addable: { id: string; x_handle: string }[];
}) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const clean = handle.trim().replace(/^@/, "").toLowerCase();
    const match = addable.find((c) => c.x_handle.toLowerCase() === clean);
    if (!match) {
      setErr(`no un-enrolled clipper with handle @${clean}`);
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/campaigns/${campaignId}/clippers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clipper_id: match.id }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "failed to add clipper");
      return;
    }
    setHandle("");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="label">clippers · {rows.length} enrolled</h2>
        <span className="font-mono text-[10px] text-text-3">
          blank = use the default shown · applies to clips submitted after save
        </span>
      </div>
      <p className="font-mono text-xs text-text-2 max-w-3xl">
        set each clipper's own rates for this campaign. a rate set here beats the
        clipper's account-wide deal, which beats the campaign defaults in the form
        below.
      </p>

      <div className="border border-border divide-y divide-border">
        {rows.length === 0 && (
          <div className="px-4 py-3 font-mono text-xs text-text-3">
            no clippers enrolled yet.
          </div>
        )}
        {rows.map((r) => (
          <ClipperRatesRow
            key={r.clipperId}
            campaignId={campaignId}
            weeklyMode={weeklyMode}
            row={r}
          />
        ))}
      </div>

      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
            add clipper
          </span>
          <input
            type="text"
            list={`addable-clippers-${campaignId}`}
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@handle"
            className="font-mono text-sm px-3 py-2 border border-border bg-transparent w-56"
          />
          <datalist id={`addable-clippers-${campaignId}`}>
            {addable.map((c) => (
              <option key={c.id} value={c.x_handle} />
            ))}
          </datalist>
        </label>
        <button
          type="submit"
          disabled={busy || !handle.trim()}
          className="font-mono text-[10px] uppercase tracking-widest px-4 py-2 border border-border hover:border-admin disabled:opacity-50"
        >
          {busy ? "adding…" : "add to campaign"}
        </button>
      </form>
      {err && <p className="font-mono text-xs text-danger">// {err}</p>}
    </section>
  );
}

function toField(v: string | null): string {
  return v != null ? Number(v).toFixed(2) : "";
}

function toBody(v: string): number | null {
  return v.trim() === "" ? null : Number(v);
}

function ClipperRatesRow({
  campaignId,
  weeklyMode,
  row,
}: {
  campaignId: string;
  weeklyMode: boolean;
  row: CampaignClipperRow;
}) {
  const router = useRouter();
  const [weekly, setWeekly] = useState(toField(row.own.weekly_base_pay_usd));
  const [cpm, setCpm] = useState(toField(row.own.cpm_rate));
  const [cap, setCap] = useState(toField(row.own.max_payout_per_clip));
  const [sponsored, setSponsored] = useState(toField(row.own.sponsored_bonus_usd));
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dirty =
    weekly !== toField(row.own.weekly_base_pay_usd) ||
    cpm !== toField(row.own.cpm_rate) ||
    cap !== toField(row.own.max_payout_per_clip) ||
    sponsored !== toField(row.own.sponsored_bonus_usd);

  async function save() {
    setBusy(true);
    setOk(false);
    setErr(null);
    const res = await fetch(`/api/admin/campaigns/${campaignId}/clippers/${row.clipperId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        weekly_base_pay_usd: weeklyMode ? toBody(weekly) : null,
        cpm_rate: toBody(cpm),
        max_payout_per_clip: toBody(cap),
        sponsored_bonus_usd: toBody(sponsored),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "failed to save");
      return;
    }
    setOk(true);
    router.refresh();
  }

  async function remove() {
    if (
      !window.confirm(
        `Remove @${row.xHandle} from this campaign? Their existing clips stay and keep paying out; they just can't submit new ones here. Their rates for this campaign are cleared.`,
      )
    )
      return;
    const res = await fetch(`/api/admin/campaigns/${campaignId}/clippers/${row.clipperId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "failed to remove");
      return;
    }
    router.refresh();
  }

  const src = (fromDeal: boolean) => (fromDeal ? "deal" : "default");
  const fields: {
    id: string;
    label: string;
    value: string;
    set: (v: string) => void;
    placeholder: string;
  }[] = [
    ...(weeklyMode
      ? [
          {
            id: "weekly",
            label: "weekly base",
            value: weekly,
            set: setWeekly,
            placeholder: `${(row.inherited.weeklyBasePay ?? 0).toFixed(2)} default`,
          },
        ]
      : []),
    {
      id: "cpm",
      label: weeklyMode ? "cpm bonus / 1k" : "cpm / 1k",
      value: cpm,
      set: setCpm,
      placeholder: `${row.inherited.cpmRate.toFixed(2)} ${src(row.inherited.fromDeal.cpm)}`,
    },
    {
      id: "cap",
      label: "cap / clip",
      value: cap,
      set: setCap,
      placeholder: `${row.inherited.maxPayoutPerClip.toFixed(2)} ${src(row.inherited.fromDeal.cap)}`,
    },
    {
      id: "sponsored",
      label: "sponsored / post",
      value: sponsored,
      set: setSponsored,
      placeholder: `${row.inherited.sponsoredBonus.toFixed(2)} ${src(row.inherited.fromDeal.sponsored)}`,
    },
  ];

  return (
    <div className="px-4 py-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
      <div className="flex flex-col gap-1 lg:w-48 shrink-0">
        <Link
          href={`/admin/clippers/${row.clipperId}` as never}
          className="font-mono text-sm text-text hover:text-admin"
        >
          @{row.xHandle}
        </Link>
        <span className="font-mono text-[10px] text-text-3">
          {row.clipCount} clip{row.clipCount === 1 ? "" : "s"} · joined{" "}
          {row.enrolledAt.slice(0, 10)}
          {row.banned && <span className="text-danger"> · banned</span>}
          {!row.banned && !row.rosterActive && <span className="text-admin"> · inactive</span>}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1">
        {fields.map((f) => (
          <label key={f.id} className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
              {f.label} $
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={f.value}
              onChange={(e) => {
                f.set(e.target.value);
                setOk(false);
              }}
              placeholder={f.placeholder}
              className="font-mono text-sm px-3 py-2 border border-border bg-transparent w-full"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="font-mono text-[10px] uppercase tracking-widest px-4 py-2 border border-border hover:border-admin disabled:opacity-50"
        >
          {busy ? "saving…" : "save"}
        </button>
        <button
          type="button"
          onClick={remove}
          className="font-mono text-[10px] uppercase tracking-widest text-danger hover:underline"
        >
          remove
        </button>
        {ok && <span className="font-mono text-[10px] text-accent">saved</span>}
        {err && <span className="font-mono text-[10px] text-danger">{err}</span>}
      </div>
    </div>
  );
}
