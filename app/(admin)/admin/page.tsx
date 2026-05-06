import { Header } from "@/components/Header";
import { StatCell, StatGrid } from "@/components/ui/StatCell";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtUsd } from "@/lib/format";
import { sumNumeric, computePayoutCents } from "@/lib/payout-calc";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const admin = createSupabaseAdminClient();

  const [{ data: clips }, { data: payouts }, { data: clippers }] = await Promise.all([
    admin
      .from("clips")
      .select(
        "clipper_id, impressions, final_impressions, payout_amount, status, cpm_rate_snapshot, max_payout_snapshot, flat_fee_snapshot",
      ),
    admin.from("payouts").select("amount"),
    admin.from("clippers").select("id, x_handle, banned"),
  ]);

  const totalImpressions =
    clips?.reduce((s, c) => s + Number(c.final_impressions ?? c.impressions ?? 0), 0) ?? 0;
  const totalSpend = sumNumeric(clips?.map((c) => c.payout_amount) ?? []);
  const totalPaid = sumNumeric(payouts?.map((p) => p.amount) ?? []);
  const outstandingCents = Math.max(
    0,
    Math.round(Number(totalSpend) * 100) - Math.round(Number(totalPaid) * 100),
  );
  const outstanding = `${Math.floor(outstandingCents / 100)}.${(outstandingCents % 100)
    .toString()
    .padStart(2, "0")}`;

  const inFlightCents = (clips ?? [])
    .filter((c) => c.status === "tracking")
    .reduce(
      (s, c) =>
        s +
        computePayoutCents(
          Number(c.impressions ?? 0),
          c.cpm_rate_snapshot,
          c.max_payout_snapshot,
          c.flat_fee_snapshot ?? 0,
        ),
      0,
    );
  const inFlight = `${Math.floor(inFlightCents / 100)}.${(inFlightCents % 100)
    .toString()
    .padStart(2, "0")}`;
  const potentialOwedCents = outstandingCents + inFlightCents;
  const potentialOwed = `${Math.floor(potentialOwedCents / 100)}.${(potentialOwedCents % 100)
    .toString()
    .padStart(2, "0")}`;

  const activeClippers = clippers?.filter((c) => !c.banned).length ?? 0;

  // Leaderboard
  const byClipper = new Map<string, { impressions: number; earned: number }>();
  for (const c of clips ?? []) {
    const cur = byClipper.get(c.clipper_id) ?? { impressions: 0, earned: 0 };
    cur.impressions += Number(c.final_impressions ?? c.impressions ?? 0);
    cur.earned += Math.round(Number(c.payout_amount ?? 0) * 100);
    byClipper.set(c.clipper_id, cur);
  }
  const handles = new Map(clippers?.map((c) => [c.id, c.x_handle]) ?? []);
  const leaderboard = Array.from(byClipper.entries())
    .map(([id, v]) => ({ id, handle: handles.get(id) ?? "—", ...v }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "OVERVIEW" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-8">
        <StatGrid>
          <StatCell label="impressions" value={fmtInt(totalImpressions)} />
          <StatCell label="spend (earned)" value={fmtUsd(totalSpend)} accent="admin" />
          <StatCell label="paid" value={fmtUsd(totalPaid)} />
          <StatCell label="outstanding" value={fmtUsd(outstanding)} accent="admin" />
        </StatGrid>

        <StatGrid>
          <StatCell label="outstanding (finalized)" value={fmtUsd(outstanding)} accent="admin" />
          <StatCell label="in-flight (estimate)" value={`~${fmtUsd(inFlight)}`} />
          <StatCell
            label="potential owed total"
            value={`~${fmtUsd(potentialOwed)}`}
            accent="admin"
          />
          <StatCell
            label="tracking clips"
            value={fmtInt(clips?.filter((c) => c.status === "tracking").length ?? 0)}
          />
        </StatGrid>

        <StatGrid>
          <StatCell label="clippers (active)" value={fmtInt(activeClippers)} />
          <StatCell label="clips total" value={fmtInt(clips?.length ?? 0)} />
          <StatCell
            label="tracking"
            value={fmtInt(clips?.filter((c) => c.status === "tracking").length ?? 0)}
            accent="accent"
          />
          <StatCell
            label="rejected"
            value={fmtInt(clips?.filter((c) => c.status === "rejected").length ?? 0)}
            accent="danger"
          />
        </StatGrid>

        <section className="flex flex-col gap-3">
          <h2 className="label">leaderboard / top 10</h2>
          <div className="border border-border">
            <Table>
              <THead>
                <TH>#</TH>
                <TH>handle</TH>
                <TH>impressions</TH>
                <TH>earned</TH>
              </THead>
              <TBody>
                {leaderboard.map((row, i) => (
                  <TR key={row.id}>
                    <TD className="font-mono text-text-3">{i + 1}</TD>
                    <TD className="font-mono">
                      <Link
                        href={`/admin/clippers/${row.id}` as never}
                        className="hover:underline"
                      >
                        @{row.handle}
                      </Link>
                    </TD>
                    <TD className="num">{fmtInt(row.impressions)}</TD>
                    <TD className="num">{fmtUsd((row.earned / 100).toFixed(2))}</TD>
                  </TR>
                ))}
                {leaderboard.length === 0 && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm" >no data yet</TD>
                    <TD />
                    <TD />
                    <TD />
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
