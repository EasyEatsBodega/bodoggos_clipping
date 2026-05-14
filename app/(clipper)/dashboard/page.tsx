import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { StatCell, StatGrid } from "@/components/ui/StatCell";
import { SubmitClipForm } from "@/components/clipper/SubmitClipForm";
import { ClipsTable } from "@/components/clipper/ClipsTable";
import { ClipperNav } from "@/components/clipper/ClipperNav";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClipperKpis } from "@/lib/queries";
import { fmtInt, fmtUsd } from "@/lib/format";
import type { Clip } from "@/lib/db-types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/");

  const { data: clipper } = await supabase
    .from("clippers")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!clipper) redirect("/onboarding");

  const [{ data: clips }, kpis, { data: campaign }] = await Promise.all([
    supabase
      .from("clips")
      .select("*")
      .eq("clipper_id", user.id)
      .order("submitted_at", { ascending: false }),
    getClipperKpis(supabase, user.id),
    supabase
      .from("campaigns")
      .select("cpm_rate, max_payout_per_clip")
      .eq("active", true)
      .maybeSingle(),
  ]);

  const effectiveCpm = Number(clipper.cpm_rate_override ?? campaign?.cpm_rate ?? 0);
  const effectiveMax = Number(clipper.max_payout_override ?? campaign?.max_payout_per_clip ?? 0);
  const effectiveFlat = Number(clipper.flat_fee_per_clip ?? 0);
  const hasCustomDeal =
    effectiveFlat > 0 ||
    clipper.cpm_rate_override != null ||
    clipper.max_payout_override != null;

  const flaggedClips = (clips ?? []).filter((c) => c.botting_suspected);
  const flaggedImpressions = flaggedClips.reduce(
    (s, c) => s + Number(c.final_impressions ?? c.impressions ?? 0),
    0,
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[
          { label: "FLICK CLIPPING", href: "/dashboard" },
          { label: `@${clipper.x_handle}` },
        ]}
        showLogout
      />
      <ClipperNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-8">
        {flaggedClips.length > 0 && (
          <div
            className="border px-4 py-3 flex flex-col gap-1"
            style={{ borderColor: "var(--danger)", background: "rgba(255, 89, 89, 0.08)" }}
          >
            <p className="font-mono text-xs text-text-2">
              <span className="text-danger">// {flaggedClips.length} clip{flaggedClips.length === 1 ? "" : "s"} flagged for review —</span>{" "}
              {fmtInt(flaggedImpressions)} impression{flaggedImpressions === 1 ? "" : "s"} are
              not being counted toward your payouts. flagged clips are
              tagged below.
            </p>
          </div>
        )}

        {!clipper.solana_wallet && (
          <div
            className="border px-4 py-3 flex items-center justify-between gap-4"
            style={{ borderColor: "var(--admin)", background: "rgba(255, 157, 89, 0.08)" }}
          >
            <p className="font-mono text-xs text-text-2">
              <span className="text-admin">// payout setup needed —</span>{" "}
              add a Solana wallet so you can get paid when your clips finish tracking.
            </p>
            <Link
              href={"/dashboard/settings" as never}
              className="font-mono text-[10px] uppercase tracking-widest text-admin hover:underline whitespace-nowrap"
            >
              add wallet →
            </Link>
          </div>
        )}

        <StatGrid>
          <StatCell label="clips" value={fmtInt(kpis.totalClips)} />
          <StatCell label="impressions" value={fmtInt(kpis.totalImpressions)} />
          <StatCell label="earned" value={fmtUsd(kpis.totalEarned)} accent="accent" />
          <StatCell
            label="outstanding"
            value={fmtUsd(kpis.outstanding)}
            hint={`paid: ${fmtUsd(kpis.totalPaid)}`}
          />
        </StatGrid>

        {campaign && (
          <p className="font-mono text-xs text-text-2">
            <span className="text-text-3">// your rate: </span>
            {effectiveFlat > 0 && <>${effectiveFlat.toFixed(2)} per clip + </>}${
              effectiveCpm.toFixed(2)
            } per 1k impressions, capped at ${effectiveMax.toFixed(2)} per clip
            {hasCustomDeal && (
              <span className="text-admin"> · custom deal</span>
            )}
          </p>
        )}

        <SubmitClipForm />

        <section className="flex flex-col gap-3">
          <h2 className="label">clips</h2>
          <ClipsTable clips={(clips ?? []) as Clip[]} />
        </section>
      </main>
    </div>
  );
}
