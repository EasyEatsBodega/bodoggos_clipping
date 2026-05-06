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
import { FlagButton } from "@/components/admin/FlagButton";
import { FlagResolveButton } from "@/components/admin/FlagResolveButton";
import { FlagDeleteButton } from "@/components/admin/FlagDeleteButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { sumNumeric, computePayoutCents } from "@/lib/payout-calc";

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

  const [{ data: clips }, { data: payouts }, { data: clipperFlags }] = await Promise.all([
    admin.from("clips").select("*").eq("clipper_id", id).order("submitted_at", { ascending: false }),
    admin.from("payouts").select("*").eq("clipper_id", id).order("paid_at", { ascending: false }),
    admin
      .from("clipper_flags")
      .select("*")
      .eq("clipper_id", id)
      .order("flagged_at", { ascending: false }),
  ]);

  const clipIds = (clips ?? []).map((c) => c.id);
  const { data: clipFlags } = clipIds.length
    ? await admin
        .from("clip_flags")
        .select("*")
        .in("clip_id", clipIds)
        .order("flagged_at", { ascending: false })
    : { data: [] as Array<{ id: string; clip_id: string; reason: string; flagged_at: string; resolved_at: string | null; resolution: string | null }> };
  const openClipFlagCount = new Map<string, number>();
  for (const f of clipFlags ?? []) {
    if (!f.resolved_at) {
      openClipFlagCount.set(f.clip_id, (openClipFlagCount.get(f.clip_id) ?? 0) + 1);
    }
  }
  const openClipperFlagCount = (clipperFlags ?? []).filter((f) => !f.resolved_at).length;

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

  const inFlightCents = (clips ?? [])
    .filter((c) => c.status === "tracking")
    .reduce(
      (s, c) =>
        s +
        computePayoutCents(
          Number(c.impressions ?? 0),
          c.cpm_rate_snapshot,
          c.max_payout_snapshot,
        ),
      0,
    );
  const inFlight = `${Math.floor(inFlightCents / 100)}.${(inFlightCents % 100)
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
            <FlagButton target="clipper" id={clipper.id} flagged={openClipperFlagCount > 0} />
            <BanToggle clipperId={clipper.id} initial={clipper.banned} />
            <DeleteClipperButton clipperId={clipper.id} handle={clipper.x_handle} />
          </div>
        </div>

        <StatGrid>
          <StatCell label="clips" value={fmtInt(clips?.length ?? 0)} />
          <StatCell label="impressions" value={fmtInt(totalImpressions)} />
          <StatCell label="earned (finalized)" value={fmtUsd(earned)} accent="accent" />
          <StatCell label="in-flight (estimate)" value={`~${fmtUsd(inFlight)}`} />
          <StatCell label="paid" value={fmtUsd(paid)} />
          <StatCell label="outstanding" value={fmtUsd(outstanding)} accent="admin" />
        </StatGrid>

        <PayoutForm clipperId={clipper.id} suggestedAmount={Number(outstanding)} />

        <section className="flex flex-col gap-3">
          <h2 className="label">flags / review queue</h2>
          <div className="border border-border">
            <Table>
              <THead>
                <TH>scope</TH>
                <TH>reason</TH>
                <TH>flagged</TH>
                <TH>state</TH>
                <TH />
                <TH />
              </THead>
              <TBody>
                {(clipperFlags ?? []).map((f) => (
                  <TR key={f.id}>
                    <TD className="font-mono text-[10px] uppercase tracking-widest">user</TD>
                    <TD className="font-mono text-xs text-text-2 max-w-[400px] truncate">
                      <span title={f.reason}>{f.reason}</span>
                    </TD>
                    <TD className="font-mono text-xs text-text-2">{fmtRelative(f.flagged_at)}</TD>
                    <TD className="font-mono text-[10px] uppercase tracking-widest">
                      {f.resolved_at ? (
                        <span className="text-text-3" title={f.resolution ?? ""}>
                          resolved
                        </span>
                      ) : (
                        <span className="text-admin">open</span>
                      )}
                    </TD>
                    <TD>
                      {!f.resolved_at && <FlagResolveButton kind="clipper" flagId={f.id} />}
                    </TD>
                    <TD>
                      <FlagDeleteButton kind="clipper" flagId={f.id} />
                    </TD>
                  </TR>
                ))}
                {(clipFlags ?? []).map((f) => (
                  <TR key={f.id}>
                    <TD className="font-mono text-[10px] uppercase tracking-widest">clip</TD>
                    <TD className="font-mono text-xs text-text-2 max-w-[400px] truncate">
                      <span title={f.reason}>{f.reason}</span>
                    </TD>
                    <TD className="font-mono text-xs text-text-2">{fmtRelative(f.flagged_at)}</TD>
                    <TD className="font-mono text-[10px] uppercase tracking-widest">
                      {f.resolved_at ? (
                        <span className="text-text-3" title={f.resolution ?? ""}>
                          resolved
                        </span>
                      ) : (
                        <span className="text-admin">open</span>
                      )}
                    </TD>
                    <TD>
                      {!f.resolved_at && <FlagResolveButton kind="clip" flagId={f.id} />}
                    </TD>
                    <TD>
                      <FlagDeleteButton kind="clip" flagId={f.id} />
                    </TD>
                  </TR>
                ))}
                {(clipperFlags ?? []).length === 0 && (clipFlags ?? []).length === 0 && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm">no flags</TD>
                    <TD /><TD /><TD /><TD /><TD />
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
        </section>

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
                <TH />
              </THead>
              <TBody>
                {(clips ?? []).map((c) => {
                  const fc = openClipFlagCount.get(c.id) ?? 0;
                  return (
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
                      <TD className="font-mono text-[10px] uppercase tracking-widest">
                        {c.status}
                        {fc > 0 && (
                          <span className="ml-2 text-admin" title={`${fc} open flag${fc === 1 ? "" : "s"}`}>
                            ⚑{fc > 1 ? fc : ""}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <FlagButton target="clip" id={c.id} flagged={fc > 0} />
                      </TD>
                      <TD>
                        <RejectClipButton clipId={c.id} status={c.status} />
                      </TD>
                      <TD>
                        <DeleteClipButton clipId={c.id} />
                      </TD>
                    </TR>
                  );
                })}
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
