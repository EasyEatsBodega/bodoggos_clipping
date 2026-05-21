import Link from "next/link";
import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { StatCell, StatGrid } from "@/components/ui/StatCell";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtRelative, fmtUsd } from "@/lib/format";
import { computePayoutCents } from "@/lib/payout-calc";
import { weekStartET, weekEndET, fmtWeekRange } from "@/lib/week";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

type WeekRow = {
  clipperId: string;
  handle: string;
  banned: boolean;
  clips: number;
  earnedCents: number;
  inFlightCents: number;
  outstandingCents: number;
};

export default async function AdminPayoutsPage() {
  const admin = createSupabaseAdminClient();

  const now = new Date();
  const thisWeekStart = weekStartET(now);
  const thisWeekEnd = weekEndET(now);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86_400_000);
  const lastWeekEnd = thisWeekStart;

  const [{ data: clippers }, { data: clips }, { data: payouts }, { data: payoutLog }] =
    await Promise.all([
      admin.from("clippers").select("id, x_handle, banned"),
      admin
        .from("clips")
        .select(
          "clipper_id, status, impressions, payout_amount, tracking_until, cpm_rate_snapshot, max_payout_snapshot, flat_fee_snapshot, min_views_snapshot",
        ),
      admin.from("payouts").select("clipper_id, amount"),
      admin
        .from("payouts")
        .select("*, clipper:clippers(x_handle)")
        .order("paid_at", { ascending: false })
        .limit(500),
    ]);

  const handleOf = new Map<string, { handle: string; banned: boolean }>();
  for (const c of clippers ?? []) {
    handleOf.set(c.id, { handle: c.x_handle, banned: c.banned });
  }

  const allTime = new Map<string, { earnedCents: number; paidCents: number }>();
  for (const c of clips ?? []) {
    const cur = allTime.get(c.clipper_id) ?? { earnedCents: 0, paidCents: 0 };
    cur.earnedCents += Math.round(Number(c.payout_amount ?? 0) * 100);
    allTime.set(c.clipper_id, cur);
  }
  for (const p of payouts ?? []) {
    const cur = allTime.get(p.clipper_id) ?? { earnedCents: 0, paidCents: 0 };
    cur.paidCents += Math.round(Number(p.amount ?? 0) * 100);
    allTime.set(p.clipper_id, cur);
  }

  function bucket(start: Date, end: Date): WeekRow[] {
    const rows = new Map<string, WeekRow>();
    const get = (id: string): WeekRow => {
      let r = rows.get(id);
      if (!r) {
        const meta = handleOf.get(id) ?? { handle: "—", banned: false };
        const at = allTime.get(id) ?? { earnedCents: 0, paidCents: 0 };
        r = {
          clipperId: id,
          handle: meta.handle,
          banned: meta.banned,
          clips: 0,
          earnedCents: 0,
          inFlightCents: 0,
          outstandingCents: Math.max(0, at.earnedCents - at.paidCents),
        };
        rows.set(id, r);
      }
      return r;
    };

    for (const c of clips ?? []) {
      if (!c.tracking_until) continue;
      const finalAt = new Date(c.tracking_until);
      if (finalAt < start || finalAt >= end) continue;
      const r = get(c.clipper_id);
      r.clips++;
      if (c.status === "completed") {
        r.earnedCents += Math.round(Number(c.payout_amount ?? 0) * 100);
      } else if (c.status === "tracking") {
        r.inFlightCents += computePayoutCents(
          Number(c.impressions ?? 0),
          c.cpm_rate_snapshot,
          c.max_payout_snapshot,
          c.flat_fee_snapshot ?? 0,
          c.min_views_snapshot ?? 0,
        );
      }
    }
    return Array.from(rows.values()).sort(
      (a, b) =>
        b.earnedCents + b.inFlightCents - (a.earnedCents + a.inFlightCents) ||
        a.handle.localeCompare(b.handle),
    );
  }

  const lastWeek = bucket(lastWeekStart, lastWeekEnd);
  const thisWeek = bucket(thisWeekStart, thisWeekEnd);

  const lastWeekFinalizedCents = lastWeek.reduce((s, r) => s + r.earnedCents, 0);
  const lastWeekInFlightCents = lastWeek.reduce((s, r) => s + r.inFlightCents, 0);
  const totalOutstandingCents = Array.from(allTime.values()).reduce(
    (s, v) => s + Math.max(0, v.earnedCents - v.paidCents),
    0,
  );
  const thisWeekFinalizedCents = thisWeek.reduce((s, r) => s + r.earnedCents, 0);
  const thisWeekInFlightCents = thisWeek.reduce((s, r) => s + r.inFlightCents, 0);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "PAYOUTS" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="label">last week / ready to pay</h2>
            <span className="font-mono text-xs text-text-2">{fmtWeekRange(lastWeekStart)} ET</span>
          </div>
          <StatGrid>
            <StatCell
              label="finalized last week"
              value={fmtUsd((lastWeekFinalizedCents / 100).toFixed(2))}
              accent="admin"
            />
            <StatCell
              label="still tracking (last wk)"
              value={fmtUsd((lastWeekInFlightCents / 100).toFixed(2))}
            />
            <StatCell
              label="total outstanding"
              value={fmtUsd((totalOutstandingCents / 100).toFixed(2))}
              accent="admin"
            />
            <StatCell
              label="clippers due"
              value={fmtInt(lastWeek.filter((r) => r.outstandingCents > 0).length)}
            />
          </StatGrid>
          <WeekTable rows={lastWeek} />
          <p className="font-mono text-[10px] text-text-3 uppercase tracking-widest">
            * &quot;earned this wk&quot; counts clips whose tracking window closed this ET week.
            &quot;in-flight&quot; estimates clips still tracking in the same window. &quot;outstanding (all)&quot; is
            the all-time unpaid balance — that&apos;s the number to actually pay.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="label">this week / forecast</h2>
            <span className="font-mono text-xs text-text-2">{fmtWeekRange(thisWeekStart)} ET</span>
          </div>
          <StatGrid>
            <StatCell
              label="finalized this week"
              value={fmtUsd((thisWeekFinalizedCents / 100).toFixed(2))}
            />
            <StatCell
              label="in-flight this week"
              value={fmtUsd((thisWeekInFlightCents / 100).toFixed(2))}
              accent="admin"
            />
            <StatCell
              label="clips finalizing"
              value={fmtInt(thisWeek.reduce((s, r) => s + r.clips, 0))}
            />
            <StatCell label="clippers" value={fmtInt(thisWeek.length)} />
          </StatGrid>
          <WeekTable rows={thisWeek} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="label">payouts log</h2>
          <div className="border border-border">
            <Table>
              <THead>
                <TH>paid</TH>
                <TH>handle</TH>
                <TH>amount</TH>
                <TH>chain</TH>
                <TH>tx</TH>
                <TH>note</TH>
              </THead>
              <TBody>
                {(payoutLog ?? []).map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs text-text-2">{fmtRelative(p.paid_at)}</TD>
                    <TD className="font-mono">@{(p as any).clipper?.x_handle ?? "—"}</TD>
                    <TD className="num">{fmtUsd(p.amount)}</TD>
                    <TD className="font-mono">{p.chain}</TD>
                    <TD className="font-mono text-xs text-text-2 max-w-[260px] truncate">
                      {p.tx_hash ?? "—"}
                    </TD>
                    <TD className="font-mono text-xs text-text-2">{p.note ?? "—"}</TD>
                  </TR>
                ))}
                {(!payoutLog || payoutLog.length === 0) && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm">no payouts yet</TD>
                    <TD /><TD /><TD /><TD /><TD />
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
        </section>
      </main>
    </div>
  );
}

function WeekTable({ rows }: { rows: WeekRow[] }) {
  return (
    <div className="border border-border">
      <Table>
        <THead>
          <TH>handle</TH>
          <TH>clips</TH>
          <TH>earned this wk</TH>
          <TH>in-flight</TH>
          <TH>outstanding (all)</TH>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.clipperId}>
              <TD className="font-mono">
                <Link href={`/admin/clippers/${r.clipperId}` as never} className="hover:underline">
                  @{r.handle}
                </Link>
                {r.banned && (
                  <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-danger">
                    banned
                  </span>
                )}
              </TD>
              <TD className="num">{fmtInt(r.clips)}</TD>
              <TD className="num">{fmtUsd((r.earnedCents / 100).toFixed(2))}</TD>
              <TD className="num text-text-2">
                {r.inFlightCents > 0 ? `~${fmtUsd((r.inFlightCents / 100).toFixed(2))}` : "—"}
              </TD>
              <TD className="num text-admin">{fmtUsd((r.outstandingCents / 100).toFixed(2))}</TD>
            </TR>
          ))}
          {rows.length === 0 && (
            <TR>
              <TD className="text-text-3 font-mono text-sm">no clips in this week</TD>
              <TD /><TD /><TD /><TD />
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}
