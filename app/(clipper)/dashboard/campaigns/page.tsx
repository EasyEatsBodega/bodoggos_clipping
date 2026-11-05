import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { ClipperNav } from "@/components/clipper/ClipperNav";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveCampaigns, getCampaignSpend } from "@/lib/queries";
import { fmtUsd } from "@/lib/format";
import type { Campaign } from "@/lib/db-types";
import { resolveClipperPay } from "@/lib/campaign-rates";

export const dynamic = "force-dynamic";

export default async function ClipperCampaignsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/");

  const { data: clipper } = await supabase
    .from("clippers")
    .select(
      "id, x_handle, flat_fee_per_clip, cpm_rate_override, max_payout_override, sponsored_bonus_override",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (!clipper) redirect("/onboarding");

  const activeCampaigns = (await getActiveCampaigns(supabase)) as Campaign[];
  const [{ data: enrollments }, { data: myRates }] = await Promise.all([
    supabase.from("campaign_enrollments").select("campaign_id").eq("clipper_id", user.id),
    // Per-campaign rates an admin set for this clipper (RLS: own rows).
    supabase
      .from("campaign_clipper_rates")
      .select("campaign_id, weekly_base_pay_usd, cpm_rate, max_payout_per_clip, sponsored_bonus_usd")
      .eq("clipper_id", user.id),
  ]);
  const enrolledIds = new Set((enrollments ?? []).map((e) => e.campaign_id));
  const ratesByCampaign = new Map((myRates ?? []).map((r) => [r.campaign_id, r]));
  // Invite-only campaigns only show up for clippers an admin added.
  const campaigns = activeCampaigns.filter((c) => !c.invite_only || enrolledIds.has(c.id));

  const spendByCampaign = new Map<string, number>(
    await Promise.all(
      campaigns.map(async (c) => [c.id, await getCampaignSpend(supabase, c.id)] as const),
    ),
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[
          { label: "FLICK CLIPPING", href: "/dashboard" },
          { label: "CAMPAIGNS" },
        ]}
        showLogout
      />
      <ClipperNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="label">campaigns</h1>
          <p className="font-mono text-xs text-text-2 max-w-xl">
            Each card is a campaign you can clip for. Enroll once, then submit clips from inside
            the campaign page.
          </p>
        </div>

        {campaigns.length === 0 ? (
          <p className="font-mono text-sm text-text-2">No active campaigns right now.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map((c) => {
              const enrolled = enrolledIds.has(c.id);
              const spent = spendByCampaign.get(c.id) ?? 0;
              const budget = c.budget_usd != null ? Number(c.budget_usd) : null;
              const remaining = budget != null ? Math.max(0, budget - spent) : null;
              // Card shows what THIS clipper earns (their own rates, if set).
              const pay = resolveClipperPay(c, clipper, ratesByCampaign.get(c.id));
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/campaigns/${c.id}` as never}
                  className="border border-border hover:border-accent p-5 flex flex-col gap-3 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-sm">{c.name}</span>
                    <span
                      className={`font-mono text-[10px] uppercase tracking-widest ${
                        enrolled ? "text-accent" : "text-text-3"
                      }`}
                    >
                      {enrolled ? "enrolled" : "not enrolled"}
                    </span>
                  </div>
                  {c.description && (
                    <p className="font-mono text-xs text-text-2 line-clamp-3">{c.description}</p>
                  )}
                  <div className="grid grid-cols-3 gap-3 font-mono text-[11px] text-text-2">
                    {pay.weeklyBasePay != null ? (
                      <div>
                        <div className="text-text-3 text-[10px] uppercase tracking-widest">
                          base /wk
                        </div>
                        <div>{fmtUsd(pay.weeklyBasePay)}</div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-text-3 text-[10px] uppercase tracking-widest">cpm</div>
                        <div>{fmtUsd(pay.cpmRate)}</div>
                      </div>
                    )}
                    {pay.weeklyBasePay != null ? (
                      <div>
                        <div className="text-text-3 text-[10px] uppercase tracking-widest">
                          cpm bonus
                        </div>
                        <div>{pay.cpmRate > 0 ? fmtUsd(pay.cpmRate) : "—"}</div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-text-3 text-[10px] uppercase tracking-widest">cap</div>
                        <div>{fmtUsd(pay.maxPayoutPerClip)}</div>
                      </div>
                    )}
                    <div>
                      <div className="text-text-3 text-[10px] uppercase tracking-widest">
                        budget
                      </div>
                      <div>{remaining != null ? `${fmtUsd(remaining)} left` : "uncapped"}</div>
                    </div>
                  </div>
                  {c.min_views != null && c.min_views > 0 && (
                    <div className="font-mono text-[10px] text-text-3">
                      min {c.min_views.toLocaleString()} views to earn
                    </div>
                  )}
                  {c.ends_at && (
                    <div className="font-mono text-[10px] text-text-3">
                      ends {new Date(c.ends_at).toISOString().slice(0, 10)}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
