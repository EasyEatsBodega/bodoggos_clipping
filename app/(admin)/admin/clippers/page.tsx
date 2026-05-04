import Link from "next/link";
import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtRelative, fmtUsd } from "@/lib/format";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminClippersPage() {
  const admin = createSupabaseAdminClient();
  const [{ data: clippers }, { data: clips }, { data: payouts }] = await Promise.all([
    admin.from("clippers").select("*").order("joined_at", { ascending: false }),
    admin.from("clips").select("clipper_id, impressions, final_impressions, payout_amount"),
    admin.from("payouts").select("clipper_id, amount"),
  ]);

  const stats = new Map<
    string,
    { clips: number; impressions: number; earnedCents: number; paidCents: number }
  >();
  for (const c of clips ?? []) {
    const cur = stats.get(c.clipper_id) ?? { clips: 0, impressions: 0, earnedCents: 0, paidCents: 0 };
    cur.clips++;
    cur.impressions += Number(c.final_impressions ?? c.impressions ?? 0);
    cur.earnedCents += Math.round(Number(c.payout_amount ?? 0) * 100);
    stats.set(c.clipper_id, cur);
  }
  for (const p of payouts ?? []) {
    const cur = stats.get(p.clipper_id) ?? { clips: 0, impressions: 0, earnedCents: 0, paidCents: 0 };
    cur.paidCents += Math.round(Number(p.amount ?? 0) * 100);
    stats.set(p.clipper_id, cur);
  }

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
              <TH>paid</TH>
              <TH>outstanding</TH>
              <TH>status</TH>
            </THead>
            <TBody>
              {(clippers ?? []).map((c) => {
                const s = stats.get(c.id) ?? { clips: 0, impressions: 0, earnedCents: 0, paidCents: 0 };
                const out = Math.max(0, s.earnedCents - s.paidCents);
                return (
                  <TR key={c.id}>
                    <TD className="font-mono">
                      <Link href={`/admin/clippers/${c.id}` as never} className="hover:underline">
                        @{c.x_handle}
                      </Link>
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
                    </TD>
                  </TR>
                );
              })}
              {(!clippers || clippers.length === 0) && (
                <TR>
                  <TD className="text-text-3 font-mono text-sm">no clippers yet</TD>
                  <TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD />
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
