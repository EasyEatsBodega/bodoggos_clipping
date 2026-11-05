import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { AdminNav } from "@/components/admin/AdminNav";
import { CampaignForm } from "@/components/admin/CampaignForm";
import { PublishCampaignButton } from "@/components/admin/PublishCampaignButton";
import {
  CampaignClippersPanel,
  type CampaignClipperRow,
} from "@/components/admin/CampaignClippersPanel";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchAllPages, getCampaignSpend, isCampaignOpen } from "@/lib/queries";
import { resolveClipperPay, type CampaignClipperRates } from "@/lib/campaign-rates";
import { fmtUsd } from "@/lib/format";
import type { Campaign, Clipper } from "@/lib/db-types";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: campaign } = await admin
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle<Campaign>();
  if (!campaign) notFound();

  type ClipperLite = Pick<
    Clipper,
    | "id"
    | "x_handle"
    | "banned"
    | "roster_active"
    | "flat_fee_per_clip"
    | "cpm_rate_override"
    | "max_payout_override"
    | "sponsored_bonus_override"
  >;
  const [enrollments, campaignClips, rateRows, clippers, spent] = await Promise.all([
    fetchAllPages<{ clipper_id: string; enrolled_at: string }>((from, to) =>
      admin
        .from("campaign_enrollments")
        .select("clipper_id, enrolled_at")
        .eq("campaign_id", id)
        .order("clipper_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{ id: string; clipper_id: string }>((from, to) =>
      admin
        .from("clips")
        .select("id, clipper_id")
        .eq("campaign_id", id)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<CampaignClipperRates>((from, to) =>
      admin
        .from("campaign_clipper_rates")
        .select("*")
        .eq("campaign_id", id)
        .order("clipper_id", { ascending: true })
        .range(from, to),
    ),
    // Every clipper: enrolled ones fill the rates table, the rest feed the
    // add-clipper picker.
    fetchAllPages<ClipperLite>((from, to) =>
      admin
        .from("clippers")
        .select(
          "id, x_handle, banned, roster_active, flat_fee_per_clip, cpm_rate_override, max_payout_override, sponsored_bonus_override",
        )
        .order("id", { ascending: true })
        .range(from, to),
    ),
    getCampaignSpend(admin, id),
  ]);
  const clipCount = campaignClips.length;
  const enrollmentCount = enrollments.length;

  const clippersById = new Map(clippers.map((c) => [c.id, c]));
  const ratesByClipper = new Map(rateRows.map((r) => [r.clipper_id, r]));
  const clipsByClipper = new Map<string, number>();
  for (const c of campaignClips) {
    clipsByClipper.set(c.clipper_id, (clipsByClipper.get(c.clipper_id) ?? 0) + 1);
  }
  const enrolledIds = new Set(enrollments.map((e) => e.clipper_id));

  const clipperRows: CampaignClipperRow[] = enrollments
    .flatMap((e) => {
      const c = clippersById.get(e.clipper_id);
      if (!c) return [];
      const own = ratesByClipper.get(c.id);
      // What applies when a field here is left blank.
      const inherited = resolveClipperPay(campaign, c, null);
      return [
        {
          clipperId: c.id,
          xHandle: c.x_handle,
          banned: c.banned,
          rosterActive: c.roster_active,
          enrolledAt: e.enrolled_at,
          clipCount: clipsByClipper.get(c.id) ?? 0,
          own: {
            weekly_base_pay_usd: own?.weekly_base_pay_usd ?? null,
            cpm_rate: own?.cpm_rate ?? null,
            max_payout_per_clip: own?.max_payout_per_clip ?? null,
            sponsored_bonus_usd: own?.sponsored_bonus_usd ?? null,
          },
          inherited: {
            weeklyBasePay: inherited.weeklyBasePay,
            cpmRate: inherited.cpmRate,
            maxPayoutPerClip: inherited.maxPayoutPerClip,
            sponsoredBonus: inherited.sponsoredBonus,
            fromDeal: {
              cpm: c.cpm_rate_override != null,
              cap: c.max_payout_override != null,
              sponsored: c.sponsored_bonus_override != null,
            },
          },
        },
      ];
    })
    .sort((a, b) => a.xHandle.localeCompare(b.xHandle));
  const addable = clippers
    .filter((c) => !enrolledIds.has(c.id) && !c.banned)
    .map((c) => ({ id: c.id, x_handle: c.x_handle }))
    .sort((a, b) => a.x_handle.localeCompare(b.x_handle));

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[
          { label: "ADMIN.OPS", href: "/admin" },
          { label: "CAMPAIGNS", href: "/admin/campaigns" },
          { label: campaign.name.toUpperCase() },
        ]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline gap-3">
              <h1 className="font-mono text-xl">{campaign.name}</h1>
              <span
                className={`font-mono text-[10px] uppercase tracking-widest ${
                  isCampaignOpen(campaign)
                    ? "text-accent"
                    : campaign.active
                      ? "text-text-3"
                      : "text-admin"
                }`}
              >
                {isCampaignOpen(campaign)
                  ? "live"
                  : campaign.active
                    ? "scheduled"
                    : "draft"}
              </span>
            </div>
            <p className="font-mono text-xs text-text-3">
              slug: {campaign.slug}
              {campaign.invite_only && <span className="text-admin"> · invite only</span>}
            </p>
          </div>
          <PublishCampaignButton campaignId={campaign.id} active={campaign.active} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border border-border p-4 font-mono text-xs">
          <div>
            <div className="text-text-3 text-[10px] uppercase tracking-widest">spent</div>
            <div>{fmtUsd(spent)}</div>
          </div>
          <div>
            <div className="text-text-3 text-[10px] uppercase tracking-widest">budget</div>
            <div>
              {campaign.budget_usd != null ? fmtUsd(campaign.budget_usd) : "uncapped"}
            </div>
          </div>
          <div>
            <div className="text-text-3 text-[10px] uppercase tracking-widest">clippers</div>
            <div>{enrollmentCount} enrolled</div>
          </div>
          <div>
            <div className="text-text-3 text-[10px] uppercase tracking-widest">clips</div>
            <div>{clipCount}</div>
          </div>
        </div>

        <CampaignClippersPanel
          campaignId={campaign.id}
          weeklyMode={campaign.weekly_base_pay_usd != null}
          rows={clipperRows}
          addable={addable}
        />

        <div className="flex flex-col gap-1 pt-4">
          <h2 className="label">campaign defaults</h2>
          <p className="font-mono text-xs text-text-2 max-w-2xl">
            Rates here apply to every clipper without their own rate above. Changes apply
            only to clips submitted <em>after</em> the change. Clips already in flight keep
            the rate and cap snapshotted at submit time.
          </p>
        </div>
        <CampaignForm mode="edit" campaign={campaign} />
      </main>
    </div>
  );
}
