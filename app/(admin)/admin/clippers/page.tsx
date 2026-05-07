import Link from "next/link";
import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtRelative, fmtUsd } from "@/lib/format";
import { computePayoutCents } from "@/lib/payout-calc";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

type ClipperStats = {
  clips: number;
  impressions: number;
  earnedCents: number;
  inFlightCents: number;
  paidCents: number;
};

const emptyStats = (): ClipperStats => ({
  clips: 0,
  impressions: 0,
  earnedCents: 0,
  inFlightCents: 0,
  paidCents: 0,
});

export default async function AdminClippersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    flagged?: string;
    custom?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const statusFilter = sp.status === "active" || sp.status === "banned" ? sp.status : undefined;
  const onlyFlagged = sp.flagged === "1";
  const onlyCustom = sp.custom === "1";

  const admin = createSupabaseAdminClient();

  let clippersQ = admin.from("clippers").select("*").order("joined_at", { ascending: false });
  if (q) {
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    clippersQ = clippersQ.or(`x_handle.ilike.${like},email.ilike.${like}`);
  }
  if (statusFilter === "active") clippersQ = clippersQ.eq("banned", false);
  if (statusFilter === "banned") clippersQ = clippersQ.eq("banned", true);
  if (onlyCustom) {
    clippersQ = clippersQ.or(
      "flat_fee_per_clip.gt.0,cpm_rate_override.not.is.null,max_payout_override.not.is.null",
    );
  }

  const [{ data: clippers }, { data: clips }, { data: payouts }, { data: openFlags }] =
    await Promise.all([
      clippersQ,
      admin
        .from("clips")
        .select(
          "clipper_id, status, impressions, final_impressions, payout_amount, cpm_rate_snapshot, max_payout_snapshot, flat_fee_snapshot",
        ),
      admin.from("payouts").select("clipper_id, amount"),
      admin.from("clipper_flags").select("clipper_id").is("resolved_at", null),
    ]);

  const flagCount = new Map<string, number>();
  for (const f of openFlags ?? []) {
    flagCount.set(f.clipper_id, (flagCount.get(f.clipper_id) ?? 0) + 1);
  }

  const stats = new Map<string, ClipperStats>();
  for (const c of clips ?? []) {
    const cur = stats.get(c.clipper_id) ?? emptyStats();
    cur.clips++;
    cur.impressions += Number(c.final_impressions ?? c.impressions ?? 0);
    cur.earnedCents += Math.round(Number(c.payout_amount ?? 0) * 100);
    if (c.status === "tracking") {
      cur.inFlightCents += computePayoutCents(
        Number(c.impressions ?? 0),
        c.cpm_rate_snapshot,
        c.max_payout_snapshot,
        c.flat_fee_snapshot ?? 0,
      );
    }
    stats.set(c.clipper_id, cur);
  }
  for (const p of payouts ?? []) {
    const cur = stats.get(p.clipper_id) ?? emptyStats();
    cur.paidCents += Math.round(Number(p.amount ?? 0) * 100);
    stats.set(p.clipper_id, cur);
  }

  const filtered = (clippers ?? []).filter((c) => {
    if (onlyFlagged && !flagCount.has(c.id)) return false;
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "CLIPPERS" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="label">clippers</h1>
          <a
            href="/api/admin/export.csv"
            className="font-mono text-[10px] uppercase tracking-widest text-admin hover:underline"
          >
            export csv ↓
          </a>
        </div>

        <form
          method="get"
          action="/admin/clippers"
          className="flex flex-wrap items-center gap-2"
        >
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="search handle or email…"
            className="input-bare font-mono text-sm px-3 py-2 border border-border bg-transparent min-w-[260px]"
          />
          {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
          {onlyFlagged && <input type="hidden" name="flagged" value="1" />}
          {onlyCustom && <input type="hidden" name="custom" value="1" />}
          <button
            type="submit"
            className="font-mono text-[10px] uppercase tracking-widest px-3 py-2 border border-border hover:border-admin"
          >
            search
          </button>
          {(q || statusFilter || onlyFlagged || onlyCustom) && (
            <a
              href="/admin/clippers"
              className="font-mono text-[10px] uppercase tracking-widest text-text-3 hover:text-text"
            >
              clear
            </a>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <FilterPill current={statusFilter} flagged={onlyFlagged} custom={onlyCustom} q={q} value={undefined} label="all" param="status" />
          <FilterPill current={statusFilter} flagged={onlyFlagged} custom={onlyCustom} q={q} value="active" label="active" param="status" />
          <FilterPill current={statusFilter} flagged={onlyFlagged} custom={onlyCustom} q={q} value="banned" label="banned" param="status" />
          <span className="w-px h-5 bg-border mx-1" />
          <TogglePill on={onlyFlagged} flagged={onlyFlagged} custom={onlyCustom} q={q} status={statusFilter} param="flagged" label="flagged ⚑" />
          <TogglePill on={onlyCustom} flagged={onlyFlagged} custom={onlyCustom} q={q} status={statusFilter} param="custom" label="custom deal" />
        </div>

        <div className="border border-border">
          <Table>
            <THead>
              <TH>handle</TH>
              <TH>email</TH>
              <TH>wallet</TH>
              <TH>joined</TH>
              <TH>clips</TH>
              <TH>impressions</TH>
              <TH>earned</TH>
              <TH>in-flight</TH>
              <TH>paid</TH>
              <TH>outstanding</TH>
              <TH>status</TH>
            </THead>
            <TBody>
              {filtered.map((c) => {
                const s = stats.get(c.id) ?? emptyStats();
                const out = Math.max(0, s.earnedCents - s.paidCents);
                const hasOverride =
                  Number(c.flat_fee_per_clip ?? 0) > 0 ||
                  c.cpm_rate_override != null ||
                  c.max_payout_override != null;
                return (
                  <TR key={c.id}>
                    <TD className="font-mono">
                      <Link href={`/admin/clippers/${c.id}` as never} className="hover:underline">
                        @{c.x_handle}
                      </Link>
                      {hasOverride && (
                        <span
                          className="ml-2 font-mono text-[10px] uppercase tracking-widest text-admin"
                          title="custom payout deal"
                        >
                          ★
                        </span>
                      )}
                    </TD>
                    <TD className="font-mono text-xs text-text-2 max-w-[200px] truncate">{c.email}</TD>
                    <TD className="font-mono text-xs max-w-[200px] truncate">
                      {c.solana_wallet ? (
                        <span className="text-text-2" title={c.solana_wallet}>
                          {c.solana_wallet}
                        </span>
                      ) : (
                        <span className="text-danger">not set</span>
                      )}
                    </TD>
                    <TD className="font-mono text-xs text-text-2">{fmtRelative(c.joined_at)}</TD>
                    <TD className="num">{fmtInt(s.clips)}</TD>
                    <TD className="num">{fmtInt(s.impressions)}</TD>
                    <TD className="num">{fmtUsd((s.earnedCents / 100).toFixed(2))}</TD>
                    <TD className="num text-text-2">
                      <span title="estimate from clips still tracking">
                        {s.inFlightCents > 0
                          ? `~${fmtUsd((s.inFlightCents / 100).toFixed(2))}`
                          : "—"}
                      </span>
                    </TD>
                    <TD className="num">{fmtUsd((s.paidCents / 100).toFixed(2))}</TD>
                    <TD className="num text-admin">{fmtUsd((out / 100).toFixed(2))}</TD>
                    <TD>
                      <span
                        className={`font-mono text-[10px] uppercase tracking-widest ${
                          c.banned ? "text-danger" : "text-accent"
                        }`}
                      >
                        {c.banned ? "banned" : "active"}
                      </span>
                      {(flagCount.get(c.id) ?? 0) > 0 && (
                        <span
                          className="ml-2 font-mono text-[10px] uppercase tracking-widest text-admin"
                          title={`${flagCount.get(c.id)} open flag${flagCount.get(c.id) === 1 ? "" : "s"}`}
                        >
                          ⚑{(flagCount.get(c.id) ?? 0) > 1 ? flagCount.get(c.id) : ""}
                        </span>
                      )}
                    </TD>
                  </TR>
                );
              })}
              {filtered.length === 0 && (
                <TR>
                  <TD className="text-text-3 font-mono text-sm">no clippers match</TD>
                  <TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD />
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      </main>
    </div>
  );
}

function buildHref(opts: {
  q?: string;
  status?: string;
  flagged?: boolean;
  custom?: boolean;
}): string {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.status) params.set("status", opts.status);
  if (opts.flagged) params.set("flagged", "1");
  if (opts.custom) params.set("custom", "1");
  const qs = params.toString();
  return qs ? `/admin/clippers?${qs}` : "/admin/clippers";
}

function FilterPill({
  current,
  flagged,
  custom,
  q,
  value,
  label,
  param,
}: {
  current: string | undefined;
  flagged: boolean;
  custom: boolean;
  q: string;
  value: string | undefined;
  label: string;
  param: "status";
}) {
  const active = current === value;
  const href = buildHref({
    q,
    flagged,
    custom,
    [param]: value,
  });
  return (
    <a
      href={href}
      className={`btn ${active ? "btn-primary" : "btn-ghost"}`}
      style={active ? { background: "var(--admin)" } : undefined}
    >
      {label}
    </a>
  );
}

function TogglePill({
  on,
  flagged,
  custom,
  q,
  status,
  param,
  label,
}: {
  on: boolean;
  flagged: boolean;
  custom: boolean;
  q: string;
  status: string | undefined;
  param: "flagged" | "custom";
  label: string;
}) {
  const next = {
    q,
    status,
    flagged: param === "flagged" ? !flagged : flagged,
    custom: param === "custom" ? !custom : custom,
  };
  const href = buildHref(next);
  return (
    <a
      href={href}
      className={`btn ${on ? "btn-primary" : "btn-ghost"}`}
      style={on ? { background: "var(--admin)" } : undefined}
    >
      {label}
    </a>
  );
}
