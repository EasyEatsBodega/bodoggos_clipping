import Link from "next/link";
import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { StatCell, StatGrid } from "@/components/ui/StatCell";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtRelative, fmtUsd } from "@/lib/format";
import { computePayoutCents } from "@/lib/payout-calc";
import { bucketSum } from "@/lib/chart-data";
import { weekStartET, weekEndET, fmtWeekRange } from "@/lib/week";
import { AdminNav } from "@/components/admin/AdminNav";
import { PayoutsPerDayChart } from "@/components/admin/OverviewCharts";
import { DeletePayoutButton } from "@/components/admin/DeletePayoutButton";
import { RowPayButton } from "@/components/admin/RowPayButton";
import { fetchAllPages } from "@/lib/queries";

export const dynamic = "force-dynamic";

type WeekRow = {
  clipperId: string;
  handle: string;
  banned: boolean;
  wallet: string | null;
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

  // Postgrest caps unbounded selects at 1000 rows. Unpaged totals here
  // would silently understate clips/payouts once the project scales, making
  // program totals and weekly buckets wrong. Page every query that feeds a
  // money number; the visible payouts-log table stays capped at 500 since
  // it's just for display.
  const [clippers, clips, payouts, payoutLog] = await Promise.all([
    fetchAllPages<{
      id: string;
      x_handle: string;
      banned: boolean;
      solana_wallet: string | null;
    }>((from, to) =>
      admin
        .from("clippers")
        .select("id, x_handle, banned, solana_wallet")
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{
      clipper_id: string;
      status: "tracking" | "completed" | "rejected";
      impressions: number | null;
      payout_amount: string | null;
      tracking_until: string | null;
      cpm_rate_snapshot: string;
      max_payout_snapshot: string;
      flat_fee_snapshot: string | null;
      min_views_snapshot: number | null;
      botting_suspected: boolean | null;
    }>((from, to) =>
      admin
        .from("clips")
        .select(
          "id, clipper_id, status, impressions, payout_amount, tracking_until, cpm_rate_snapshot, max_payout_snapshot, flat_fee_snapshot, min_views_snapshot, botting_suspected",
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
    admin
      .from("payouts")
      .select("*, clipper:clippers(x_handle)")
      .order("paid_at", { ascending: false })
      .limit(500)
      .then((r) => r.data ?? []),
  ]);

  const handleOf = new Map<
    string,
    { handle: string; banned: boolean; wallet: string | null }
  >();
  for (const c of clippers ?? []) {
    handleOf.set(c.id, {
      handle: c.x_handle,
      banned: c.banned,
      wallet: c.solana_wallet,
    });
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
        const meta = handleOf.get(id) ?? { handle: "—", banned: false, wallet: null };
        const at = allTime.get(id) ?? { earnedCents: 0, paidCents: 0 };
        r = {
          clipperId: id,
          handle: meta.handle,
          banned: meta.banned,
          wallet: meta.wallet,
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

  // Program-wide money totals (moved here from the overview dashboard).
  const totalEarnedCents = Array.from(allTime.values()).reduce(
    (s, v) => s + v.earnedCents,
    0,
  );
  const totalPaidCents = Array.from(allTime.values()).reduce(
    (s, v) => s + v.paidCents,
    0,
  );
  const programInFlightCents = (clips ?? [])
    .filter((c) => c.status === "tracking" && !c.botting_suspected)
    .reduce(
      (s, c) =>
        s +
        computePayoutCents(
          Number(c.impressions ?? 0),
          c.cpm_rate_snapshot,
          c.max_payout_snapshot,
          c.flat_fee_snapshot ?? 0,
          c.min_views_snapshot ?? 0,
        ),
      0,
    );
  const potentialOwedCents = totalOutstandingCents + programInFlightCents;

  const chartStart = new Date(now.getTime() - 30 * 86_400_000);
  const payoutsSeries = bucketSum(
    payoutLog ?? [],
    (p) => p.paid_at,
    (p) => p.amount,
    chartStart,
    now,
  );

  const usd = (cents: number) => fmtUsd((cents / 100).toFixed(2));

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
            <h2 className="label">program totals</h2>
            <Link
              href={"/admin/payouts/review" as never}
              className="font-mono text-[10px] uppercase tracking-widest text-admin hover:underline"
            >
              sanity review →
            </Link>
          </div>
          <StatGrid>
            <StatCell label="spend (earned)" value={usd(totalEarnedCents)} accent="admin" />
            <StatCell label="paid" value={usd(totalPaidCents)} />
            <StatCell
              label="outstanding"
              value={usd(totalOutstandingCents)}
              accent="admin"
              hint="finalized, unpaid"
            />
            <StatCell
              label="potential owed total"
              value={`~${usd(potentialOwedCents)}`}
              hint={`incl. ~${usd(programInFlightCents)} in-flight`}
            />
          </StatGrid>
          <PayoutsPerDayChart data={payoutsSeries} />
        </section>

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
                <TH />
              </THead>
              <TBody>
                {(payoutLog ?? []).map((p) => {
                  const handle = (p as any).clipper?.x_handle ?? "—";
                  return (
                    <TR key={p.id}>
                      <TD className="font-mono text-xs text-text-2">{fmtRelative(p.paid_at)}</TD>
                      <TD className="font-mono">@{handle}</TD>
                      <TD className="num">{fmtUsd(p.amount)}</TD>
                      <TD className="font-mono">{p.chain}</TD>
                      <TD className="font-mono text-xs text-text-2 max-w-[260px] truncate">
                        {p.tx_hash ?? "—"}
                      </TD>
                      <TD className="font-mono text-xs text-text-2">{p.note ?? "—"}</TD>
                      <TD>
                        <DeletePayoutButton
                          payoutId={p.id}
                          handle={handle}
                          amount={p.amount}
                        />
                      </TD>
                    </TR>
                  );
                })}
                {(!payoutLog || payoutLog.length === 0) && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm">no payouts yet</TD>
                    <TD /><TD /><TD /><TD /><TD /><TD />
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
          <TH>pay</TH>
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
              <TD>
                <RowPayButton
                  clipperId={r.clipperId}
                  handle={r.handle}
                  recipientWallet={r.wallet}
                  owedCents={r.outstandingCents}
                />
              </TD>
            </TR>
          ))}
          {rows.length === 0 && (
            <TR>
              <TD className="text-text-3 font-mono text-sm">no clips in this week</TD>
              <TD /><TD /><TD /><TD /><TD />
            </TR>
          )}
        </TBody>
      </Table>
    </div>
  );
}
