import Link from "next/link";
import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtRelative, fmtUsd } from "@/lib/format";
import { computePayoutCents, computeRollingOwedCents } from "@/lib/payout-calc";
import { AdminNav } from "@/components/admin/AdminNav";
import { RowPayButton } from "@/components/admin/RowPayButton";
import { RosterActiveToggle } from "@/components/admin/RosterActiveToggle";
import { TaxRequestButton, type TaxRowState } from "@/components/admin/TaxRequestButton";
import { currentTaxYear } from "@/lib/tax-compliance";
import { fetchAllPages } from "@/lib/queries";

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

type SortCol =
  | "handle"
  | "email"
  | "joined"
  | "clips"
  | "impressions"
  | "avg_clip"
  | "earned"
  | "in_flight"
  | "paid"
  | "outstanding"
  | "status";

const VALID_SORT: SortCol[] = [
  "handle",
  "email",
  "joined",
  "clips",
  "impressions",
  "avg_clip",
  "earned",
  "in_flight",
  "paid",
  "outstanding",
  "status",
];

export default async function AdminClippersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    flagged?: string;
    custom?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const statusFilter =
    sp.status === "active" || sp.status === "banned" || sp.status === "inactive"
      ? sp.status
      : undefined;
  const onlyFlagged = sp.flagged === "1";
  const onlyCustom = sp.custom === "1";
  const sortCol = (VALID_SORT as string[]).includes(sp.sort ?? "")
    ? (sp.sort as SortCol)
    : ("joined" as SortCol);
  const sortDir = sp.dir === "asc" ? "asc" : "desc";

  const admin = createSupabaseAdminClient();

  const like = q ? `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%` : null;

  // Each unbounded select capped at 1000 rows by Postgrest, which silently
  // truncates accounting data once any table grows past the cap. The marks
  // truncation in particular caused paid clippers to keep showing as fully
  // owed (double-pay risk), so every list-driving query is paged.
  const buildClippers = (from: number, to: number) => {
    let qb = admin.from("clippers").select("*");
    if (like) qb = qb.or(`x_handle.ilike.${like},email.ilike.${like}`);
    // "active" = on the roster and not banned; "inactive" = deactivated
    // from the roster (their new submissions are rejected).
    if (statusFilter === "active") qb = qb.eq("banned", false).eq("roster_active", true);
    if (statusFilter === "banned") qb = qb.eq("banned", true);
    if (statusFilter === "inactive") qb = qb.eq("roster_active", false);
    if (onlyCustom) {
      qb = qb.or(
        "flat_fee_per_clip.gt.0,cpm_rate_override.not.is.null,max_payout_override.not.is.null",
      );
    }
    return qb.order("id", { ascending: true }).range(from, to);
  };

  const taxYear = currentTaxYear();
  const [clippers, clips, payouts, openFlags, marks, taxInfos] = await Promise.all([
    fetchAllPages<{
      id: string;
      x_handle: string;
      email: string;
      solana_wallet: string | null;
      joined_at: string;
      banned: boolean;
      roster_active: boolean;
      flat_fee_per_clip: string;
      cpm_rate_override: string | null;
      max_payout_override: string | null;
    }>(buildClippers),
    fetchAllPages<{
      id: string;
      clipper_id: string;
      status: "tracking" | "completed" | "rejected";
      impressions: number | null;
      final_impressions: number | null;
      payout_amount: string | null;
      cpm_rate_snapshot: string;
      max_payout_snapshot: string;
      flat_fee_snapshot: string | null;
      min_views_snapshot: number | null;
    }>((from, to) =>
      admin
        .from("clips")
        .select(
          "id, clipper_id, status, impressions, final_impressions, payout_amount, cpm_rate_snapshot, max_payout_snapshot, flat_fee_snapshot, min_views_snapshot",
        )
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{ clipper_id: string; amount: string }>((from, to) =>
      admin
        .from("payouts")
        .select("clipper_id, amount")
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{ clipper_id: string }>((from, to) =>
      admin
        .from("clipper_flags")
        .select("clipper_id")
        .is("resolved_at", null)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{ clip_id: string; impressions_at_mark: number }>((from, to) =>
      admin
        .from("payout_clip_marks")
        .select("clip_id, impressions_at_mark")
        .order("clip_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{
      clipper_id: string;
      submitted_at: string | null;
      cleared_at: string | null;
      requested_at: string | null;
    }>((from, to) =>
      admin
        .from("clipper_tax_info")
        .select("clipper_id, submitted_at, cleared_at, requested_at")
        .eq("tax_year", taxYear)
        .order("clipper_id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const taxState = new Map<string, TaxRowState>();
  for (const t of taxInfos ?? []) {
    taxState.set(
      t.clipper_id,
      t.cleared_at ? "cleared" : t.submitted_at ? "submitted" : "requested",
    );
  }

  const flagCount = new Map<string, number>();
  for (const f of openFlags ?? []) {
    flagCount.set(f.clipper_id, (flagCount.get(f.clipper_id) ?? 0) + 1);
  }

  const stats = new Map<string, ClipperStats>();
  // Group clips by clipper so we can compute rolling owed against marks.
  const clipsByClipper = new Map<string, typeof clips>();
  // Map every clip back to its clipper so we can attribute marks.
  const clipToClipper = new Map<string, string>();
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
        c.min_views_snapshot ?? 0,
      );
    }
    stats.set(c.clipper_id, cur);
    const arr = clipsByClipper.get(c.clipper_id) ?? [];
    arr.push(c);
    clipsByClipper.set(c.clipper_id, arr);
    clipToClipper.set(c.id, c.clipper_id);
  }
  for (const p of payouts ?? []) {
    const cur = stats.get(p.clipper_id) ?? emptyStats();
    cur.paidCents += Math.round(Number(p.amount ?? 0) * 100);
    stats.set(p.clipper_id, cur);
  }

  // For each clipper, the latest impressions_at_mark per clip.
  const marksByClipper = new Map<string, Map<string, number>>();
  for (const m of marks ?? []) {
    const clipperId = clipToClipper.get(m.clip_id);
    if (!clipperId) continue;
    let cm = marksByClipper.get(clipperId);
    if (!cm) {
      cm = new Map();
      marksByClipper.set(clipperId, cm);
    }
    const cur = cm.get(m.clip_id);
    if (cur == null || m.impressions_at_mark > cur) {
      cm.set(m.clip_id, m.impressions_at_mark);
    }
  }

  type Row = {
    id: string;
    x_handle: string;
    email: string;
    solana_wallet: string | null;
    joined_at: string;
    banned: boolean;
    roster_active: boolean;
    flat_fee_per_clip: string;
    cpm_rate_override: string | null;
    max_payout_override: string | null;
    s: ClipperStats;
    out: number;
    flags: number;
    hasOverride: boolean;
  };

  const rows: Row[] = (clippers ?? [])
    .filter((c) => {
      if (onlyFlagged && !flagCount.has(c.id)) return false;
      return true;
    })
    .map((c) => {
      const s = stats.get(c.id) ?? emptyStats();
      const clipperClips = clipsByClipper.get(c.id) ?? [];
      const owedCents = computeRollingOwedCents(
        clipperClips,
        marksByClipper.get(c.id) ?? new Map(),
      );
      return {
        id: c.id,
        x_handle: c.x_handle,
        email: c.email,
        solana_wallet: c.solana_wallet,
        joined_at: c.joined_at,
        banned: c.banned,
        roster_active: c.roster_active,
        flat_fee_per_clip: c.flat_fee_per_clip,
        cpm_rate_override: c.cpm_rate_override,
        max_payout_override: c.max_payout_override,
        s,
        out: owedCents,
        flags: flagCount.get(c.id) ?? 0,
        hasOverride:
          Number(c.flat_fee_per_clip ?? 0) > 0 ||
          c.cpm_rate_override != null ||
          c.max_payout_override != null,
      };
    });

  const sign = sortDir === "asc" ? 1 : -1;
  rows.sort((a, b) => sign * cmpRows(a, b, sortCol));

  const baseParams = { q, status: statusFilter, flagged: onlyFlagged, custom: onlyCustom };

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
          {sortCol !== "joined" && <input type="hidden" name="sort" value={sortCol} />}
          {sortDir !== "desc" && <input type="hidden" name="dir" value={sortDir} />}
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
          <FilterPill base={baseParams} sortCol={sortCol} sortDir={sortDir} value={undefined} label="all" />
          <FilterPill base={baseParams} sortCol={sortCol} sortDir={sortDir} value="active" label="active" />
          <FilterPill base={baseParams} sortCol={sortCol} sortDir={sortDir} value="inactive" label="inactive" />
          <FilterPill base={baseParams} sortCol={sortCol} sortDir={sortDir} value="banned" label="banned" />
          <span className="w-px h-5 bg-border mx-1" />
          <TogglePill on={onlyFlagged} base={baseParams} sortCol={sortCol} sortDir={sortDir} param="flagged" label="flagged ⚑" />
          <TogglePill on={onlyCustom} base={baseParams} sortCol={sortCol} sortDir={sortDir} param="custom" label="custom deal" />
        </div>

        <div className="border border-border">
          <Table>
            <THead>
              <SortTH base={baseParams} col="handle" sortCol={sortCol} sortDir={sortDir}>handle</SortTH>
              <SortTH base={baseParams} col="email" sortCol={sortCol} sortDir={sortDir}>email</SortTH>
              <TH>wallet</TH>
              <SortTH base={baseParams} col="joined" sortCol={sortCol} sortDir={sortDir}>joined</SortTH>
              <SortTH base={baseParams} col="clips" sortCol={sortCol} sortDir={sortDir}>clips</SortTH>
              <SortTH base={baseParams} col="impressions" sortCol={sortCol} sortDir={sortDir}>impressions</SortTH>
              <SortTH base={baseParams} col="avg_clip" sortCol={sortCol} sortDir={sortDir}>avg views / clip</SortTH>
              <SortTH base={baseParams} col="earned" sortCol={sortCol} sortDir={sortDir}>earned</SortTH>
              <SortTH base={baseParams} col="in_flight" sortCol={sortCol} sortDir={sortDir}>in-flight</SortTH>
              <SortTH base={baseParams} col="paid" sortCol={sortCol} sortDir={sortDir}>paid</SortTH>
              <SortTH base={baseParams} col="outstanding" sortCol={sortCol} sortDir={sortDir}>owed now</SortTH>
              <SortTH base={baseParams} col="status" sortCol={sortCol} sortDir={sortDir}>status</SortTH>
              <TH>tax</TH>
              <TH>pay</TH>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono">
                    <Link href={`/admin/clippers/${r.id}` as never} className="hover:underline">
                      @{r.x_handle}
                    </Link>
                    {r.hasOverride && (
                      <span
                        className="ml-2 font-mono text-[10px] uppercase tracking-widest text-admin"
                        title="custom payout deal"
                      >
                        ★
                      </span>
                    )}
                  </TD>
                  <TD className="font-mono text-xs text-text-2 max-w-[200px] truncate">{r.email}</TD>
                  <TD className="font-mono text-xs max-w-[200px] truncate">
                    {r.solana_wallet ? (
                      <span className="text-text-2" title={r.solana_wallet}>
                        {r.solana_wallet}
                      </span>
                    ) : (
                      <span className="text-danger">not set</span>
                    )}
                  </TD>
                  <TD className="font-mono text-xs text-text-2">{fmtRelative(r.joined_at)}</TD>
                  <TD className="num">{fmtInt(r.s.clips)}</TD>
                  <TD className="num">{fmtInt(r.s.impressions)}</TD>
                  <TD className="num">
                    {fmtInt(r.s.clips > 0 ? Math.round(r.s.impressions / r.s.clips) : 0)}
                  </TD>
                  <TD className="num">{fmtUsd((r.s.earnedCents / 100).toFixed(2))}</TD>
                  <TD className="num text-text-2">
                    <span title="estimate from clips still tracking">
                      {r.s.inFlightCents > 0
                        ? `~${fmtUsd((r.s.inFlightCents / 100).toFixed(2))}`
                        : "—"}
                    </span>
                  </TD>
                  <TD className="num">{fmtUsd((r.s.paidCents / 100).toFixed(2))}</TD>
                  <TD className="num text-admin">{fmtUsd((r.out / 100).toFixed(2))}</TD>
                  <TD>
                    <span
                      className={`font-mono text-[10px] uppercase tracking-widest ${
                        r.banned
                          ? "text-danger"
                          : r.roster_active
                            ? "text-accent"
                            : "text-text-3"
                      }`}
                      title={
                        r.banned
                          ? "banned — login suspended"
                          : r.roster_active
                            ? "on the roster — clips count"
                            : "off the roster — new submissions rejected; existing clips still pay out"
                      }
                    >
                      {r.banned ? "banned" : r.roster_active ? "active" : "inactive"}
                    </span>
                    {r.flags > 0 && (
                      <span
                        className="ml-2 font-mono text-[10px] uppercase tracking-widest text-admin"
                        title={`${r.flags} open flag${r.flags === 1 ? "" : "s"}`}
                      >
                        ⚑{r.flags > 1 ? r.flags : ""}
                      </span>
                    )}
                    {!r.banned && (
                      <span className="ml-2">
                        <RosterActiveToggle
                          clipperId={r.id}
                          handle={r.x_handle}
                          initial={r.roster_active}
                        />
                      </span>
                    )}
                  </TD>
                  <TD>
                    <TaxRequestButton clipperId={r.id} state={taxState.get(r.id) ?? "none"} />
                  </TD>
                  <TD>
                    <RowPayButton
                      clipperId={r.id}
                      handle={r.x_handle}
                      recipientWallet={r.solana_wallet}
                      owedCents={r.out}
                    />
                  </TD>
                </TR>
              ))}
              {rows.length === 0 && (
                <TR>
                  <TD className="text-text-3 font-mono text-sm">no clippers match</TD>
                  <TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD />
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      </main>
    </div>
  );
}

type Row = {
  x_handle: string;
  email: string;
  joined_at: string;
  banned: boolean;
  s: ClipperStats;
  out: number;
};

function cmpRows(a: Row, b: Row, col: SortCol): number {
  switch (col) {
    case "handle":
      return a.x_handle.localeCompare(b.x_handle);
    case "email":
      return a.email.localeCompare(b.email);
    case "joined":
      return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
    case "clips":
      return a.s.clips - b.s.clips;
    case "impressions":
      return a.s.impressions - b.s.impressions;
    case "avg_clip": {
      const avg = (s: ClipperStats) => (s.clips > 0 ? s.impressions / s.clips : 0);
      return avg(a.s) - avg(b.s);
    }
    case "earned":
      return a.s.earnedCents - b.s.earnedCents;
    case "in_flight":
      return a.s.inFlightCents - b.s.inFlightCents;
    case "paid":
      return a.s.paidCents - b.s.paidCents;
    case "outstanding":
      return a.out - b.out;
    case "status":
      return Number(a.banned) - Number(b.banned);
  }
}

type BaseParams = {
  q: string;
  status: string | undefined;
  flagged: boolean;
  custom: boolean;
};

function buildHref(opts: BaseParams & { sort?: string; dir?: string }): string {
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  if (opts.status) params.set("status", opts.status);
  if (opts.flagged) params.set("flagged", "1");
  if (opts.custom) params.set("custom", "1");
  if (opts.sort && opts.sort !== "joined") params.set("sort", opts.sort);
  if (opts.dir && opts.dir !== "desc") params.set("dir", opts.dir);
  const qs = params.toString();
  return qs ? `/admin/clippers?${qs}` : "/admin/clippers";
}

function FilterPill({
  base,
  sortCol,
  sortDir,
  value,
  label,
}: {
  base: BaseParams;
  sortCol: string;
  sortDir: string;
  value: string | undefined;
  label: string;
}) {
  const active = base.status === value;
  const href = buildHref({ ...base, status: value, sort: sortCol, dir: sortDir });
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
  base,
  sortCol,
  sortDir,
  param,
  label,
}: {
  on: boolean;
  base: BaseParams;
  sortCol: string;
  sortDir: string;
  param: "flagged" | "custom";
  label: string;
}) {
  const next = {
    ...base,
    flagged: param === "flagged" ? !base.flagged : base.flagged,
    custom: param === "custom" ? !base.custom : base.custom,
    sort: sortCol,
    dir: sortDir,
  };
  return (
    <a
      href={buildHref(next)}
      className={`btn ${on ? "btn-primary" : "btn-ghost"}`}
      style={on ? { background: "var(--admin)" } : undefined}
    >
      {label}
    </a>
  );
}

function SortTH({
  base,
  col,
  sortCol,
  sortDir,
  children,
}: {
  base: BaseParams;
  col: SortCol;
  sortCol: SortCol;
  sortDir: "asc" | "desc";
  children: React.ReactNode;
}) {
  const active = sortCol === col;
  // Click cycle: not-active → desc; desc → asc; asc → desc
  const nextDir: "asc" | "desc" = active && sortDir === "desc" ? "asc" : "desc";
  const arrow = active ? (sortDir === "desc" ? "▼" : "▲") : "";
  const href = buildHref({ ...base, sort: col, dir: nextDir });
  return (
    <TH>
      <a
        href={href}
        className={`hover:text-text ${active ? "text-admin" : "text-text-2"}`}
      >
        <span>
          {children}
          {arrow && <span className="ml-1 text-[8px]">{arrow}</span>}
        </span>
      </a>
    </TH>
  );
}
