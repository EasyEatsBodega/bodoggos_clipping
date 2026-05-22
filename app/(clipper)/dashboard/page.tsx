import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { StatCell, StatGrid } from "@/components/ui/StatCell";
import { ClipsTable } from "@/components/clipper/ClipsTable";
import { ClipperNav } from "@/components/clipper/ClipperNav";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveCampaigns, getClipperKpis } from "@/lib/queries";
import { fmtInt, fmtUsd } from "@/lib/format";
import { TaxComplianceNotice } from "@/components/clipper/TaxComplianceNotice";
import { computeTaxStatus, currentTaxYear, earnedCentsInYear } from "@/lib/tax-compliance";
import type { Campaign, Clip } from "@/lib/db-types";

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

  const taxYear = currentTaxYear();
  const [{ data: clips }, kpis, campaigns, { data: enrollments }, { data: taxInfo }] =
    await Promise.all([
      supabase
        .from("clips")
        .select("*")
        .eq("clipper_id", user.id)
        .order("submitted_at", { ascending: false }),
      getClipperKpis(supabase, user.id),
      getActiveCampaigns(supabase) as Promise<Campaign[]>,
      supabase.from("campaign_enrollments").select("campaign_id").eq("clipper_id", user.id),
      supabase
        .from("clipper_tax_info")
        .select("legal_first_name, legal_last_name, country, submitted_at, cleared_at")
        .eq("clipper_id", user.id)
        .eq("tax_year", taxYear)
        .maybeSingle(),
    ]);

  const taxStatus = computeTaxStatus(
    earnedCentsInYear(clips ?? [], taxYear),
    taxInfo ?? null,
    taxYear,
  );

  const enrolledIds = new Set((enrollments ?? []).map((e) => e.campaign_id));
  const enrolledCampaigns = campaigns.filter((c) => enrolledIds.has(c.id));
  const unenrolledCount = campaigns.length - enrolledCampaigns.length;

  const flaggedClips = (clips ?? []).filter((c) => c.botting_suspected);
  const flaggedImpressions = flaggedClips.reduce(
    (s, c) => s + Number(c.final_impressions ?? c.impressions ?? 0),
    0,
  );

  const hasCustomDeal =
    Number(clipper.flat_fee_per_clip ?? 0) > 0 ||
    clipper.cpm_rate_override != null ||
    clipper.max_payout_override != null;

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
        {taxStatus.needsSubmission && (
          <TaxComplianceNotice state="needs_submission" taxYear={taxYear} />
        )}
        {taxStatus.awaitingClearance && (
          <TaxComplianceNotice state="awaiting_clearance" taxYear={taxYear} />
        )}

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

        {hasCustomDeal && (
          <p className="font-mono text-xs text-text-2">
            <span className="text-admin">// custom deal —</span> your per-clipper override
            replaces the campaign defaults on every clip you submit.
          </p>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="label">campaigns</h2>
            <Link
              href={"/dashboard/campaigns" as never}
              className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
            >
              browse all →
            </Link>
          </div>
          {enrolledCampaigns.length === 0 ? (
            <div className="border border-border p-5 flex flex-col gap-2">
              <p className="font-mono text-xs text-text-2">
                {campaigns.length === 0
                  ? "No active campaigns right now. Check back soon."
                  : "You're not enrolled in any campaign yet. Pick one to start submitting clips."}
              </p>
              {campaigns.length > 0 && (
                <Link
                  href={"/dashboard/campaigns" as never}
                  className="font-mono text-xs text-accent hover:underline"
                >
                  see {campaigns.length} active campaign{campaigns.length === 1 ? "" : "s"} →
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {enrolledCampaigns.map((c) => (
                <Link
                  key={c.id}
                  href={`/dashboard/campaigns/${c.id}` as never}
                  className="border border-border hover:border-accent p-4 flex flex-col gap-1 transition-colors"
                >
                  <span className="font-mono text-sm">{c.name}</span>
                  <span className="font-mono text-[11px] text-text-3">
                    {fmtUsd(c.cpm_rate)} cpm · cap {fmtUsd(c.max_payout_per_clip)} ·{" "}
                    {c.tracking_days}d tracking
                  </span>
                </Link>
              ))}
              {unenrolledCount > 0 && (
                <Link
                  href={"/dashboard/campaigns" as never}
                  className="border border-dashed border-border hover:border-accent p-4 flex items-center justify-center font-mono text-xs text-text-2 hover:text-accent transition-colors"
                >
                  + {unenrolledCount} more campaign{unenrolledCount === 1 ? "" : "s"} available
                </Link>
              )}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="label">all your clips</h2>
          <ClipsTable clips={(clips ?? []) as Clip[]} />
        </section>
      </main>
    </div>
  );
}
