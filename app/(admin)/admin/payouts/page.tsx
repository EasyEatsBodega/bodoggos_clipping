import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtRelative, fmtUsd } from "@/lib/format";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminPayoutsPage() {
  const admin = createSupabaseAdminClient();
  const { data: payouts } = await admin
    .from("payouts")
    .select("*, clipper:clippers(x_handle)")
    .order("paid_at", { ascending: false })
    .limit(500);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "PAYOUTS" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-6">
        <h1 className="label">payouts</h1>
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
              {(payouts ?? []).map((p) => (
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
              {(!payouts || payouts.length === 0) && (
                <TR>
                  <TD className="text-text-3 font-mono text-sm">no payouts yet</TD>
                  <TD /><TD /><TD /><TD /><TD />
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
