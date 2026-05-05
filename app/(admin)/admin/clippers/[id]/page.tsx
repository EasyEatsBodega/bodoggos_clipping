import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { StatCell, StatGrid } from "@/components/ui/StatCell";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtRelative, fmtUsd } from "@/lib/format";
import { BanToggle } from "@/components/admin/BanToggle";
import { PayoutForm } from "@/components/admin/PayoutForm";
import { RejectClipButton } from "@/components/admin/RejectClipButton";
import { DeleteClipButton } from "@/components/admin/DeleteClipButton";
import { DeleteClipperButton } from "@/components/admin/DeleteClipperButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { sumNumeric } from "@/lib/payout-calc";

export const dynamic = "force-dynamic";

export default async function AdminClipperDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: clipper } = await admin.from("clippers").select("*").eq("id", id).maybeSingle();
  if (!clipper) notFound();

  const [{ data: clips }, { data: payouts }] = await Promise.all([
    admin.from("clips").select("*").eq("clipper_id", id).order("submitted_at", { ascending: false }),
    admin.from("payouts").select("*").eq("clipper_id", id).order("paid_at", { ascending: false }),
  ]);

  const totalImpressions =
    clips?.reduce((s, c) => s + Number(c.final_impressions ?? c.impressions ?? 0), 0) ?? 0;
  const earned = sumNumeric(clips?.map((c) => c.payout_amount) ?? []);
  const paid = sumNumeric(payouts?.map((p) => p.amount) ?? []);
  const outstandingCents = Math.max(
    0,
    Math.round(Number(earned) * 100) - Math.round(Number(paid) * 100),
  );
  const outstanding = `${Math.floor(outstandingCents / 100)}.${(outstandingCents % 100)
    .toString()
    .padStart(2, "0")}`;

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[
          { label: "ADMIN.OPS", href: "/admin" },
          { label: "CLIPPERS", href: "/admin/clippers" },
          { label: `@${clipper.x_handle}` },
        ]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-3xl">@{clipper.x_handle}</h1>
            <p className="font-mono text-xs text-text-2 mt-1">{clipper.email}</p>
            <p className="font-mono text-xs text-text-2 mt-1">
              <span className="text-text-3">// solana wallet: </span>
              {clipper.solana_wallet ? (
                <span className="text-text">{clipper.solana_wallet}</span>
              ) : (
                <span className="text-danger">not set</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <BanToggle clipperId={clipper.id} initial={clipper.banned} />
            <DeleteClipperButton clipperId={clipper.id} handle={clipper.x_handle} />
          </div>
        </div>

        <StatGrid>
          <StatCell label="clips" value={fmtInt(clips?.length ?? 0)} />
          <StatCell label="impressions" value={fmtInt(totalImpressions)} />
          <StatCell label="earned" value={fmtUsd(earned)} accent="accent" />
          <StatCell label="outstanding" value={fmtUsd(outstanding)} accent="admin" />
        </StatGrid>

        <PayoutForm clipperId={clipper.id} suggestedAmount={Number(outstanding)} />

        <section className="flex flex-col gap-3">
          <h2 className="label">clips</h2>
          <div className="border border-border">
            <Table>
              <THead>
                <TH>tweet</TH>
                <TH>submitted</TH>
                <TH>impressions</TH>
                <TH>earned</TH>
                <TH>status</TH>
                <TH />
                <TH />
              </THead>
              <TBody>
                {(clips ?? []).map((c) => (
                  <TR key={c.id}>
                    <TD className="font-mono text-xs text-text-2 max-w-[260px] truncate">
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {c.url}
                      </a>
                    </TD>
                    <TD className="font-mono text-xs text-text-2">{fmtRelative(c.submitted_at)}</TD>
                    <TD className="num">{fmtInt(c.final_impressions ?? c.impressions)}</TD>
                    <TD className="num">{c.payout_amount ? fmtUsd(c.payout_amount) : "—"}</TD>
                    <TD className="font-mono text-[10px] uppercase tracking-widest">{c.status}</TD>
                    <TD>
                      <RejectClipButton clipId={c.id} status={c.status} />
                    </TD>
                    <TD>
                      <DeleteClipButton clipId={c.id} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="label">payouts</h2>
          <div className="border border-border">
            <Table>
              <THead>
                <TH>paid</TH>
                <TH>amount</TH>
                <TH>chain</TH>
                <TH>tx</TH>
                <TH>note</TH>
              </THead>
              <TBody>
                {(payouts ?? []).map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs text-text-2">{fmtRelative(p.paid_at)}</TD>
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
                    <TD /><TD /><TD /><TD />
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
