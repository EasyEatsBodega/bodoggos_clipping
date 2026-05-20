import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { ClipperNav } from "@/components/clipper/ClipperNav";
import { SubmitClipForm } from "@/components/clipper/SubmitClipForm";
import { EnrollCampaignButton } from "@/components/clipper/EnrollCampaignButton";
import { ClipsTable } from "@/components/clipper/ClipsTable";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCampaignSpend, isCampaignOpen } from "@/lib/queries";
import { fmtUsd } from "@/lib/format";
import type { Campaign, Clip } from "@/lib/db-types";

export const dynamic = "force-dynamic";

export default async function ClipperCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/");

  const { data: clipper } = await supabase
    .from("clippers")
    .select("id, x_handle")
    .eq("id", user.id)
    .maybeSingle();
  if (!clipper) redirect("/onboarding");

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle<Campaign>();
  if (!campaign) notFound();

  const open = isCampaignOpen(campaign);

  const [{ data: enrollment }, { data: clips }, spent] = await Promise.all([
    supabase
      .from("campaign_enrollments")
      .select("clipper_id")
      .eq("clipper_id", user.id)
      .eq("campaign_id", campaign.id)
      .maybeSingle(),
    supabase
      .from("clips")
      .select("*")
      .eq("clipper_id", user.id)
      .eq("campaign_id", campaign.id)
      .order("submitted_at", { ascending: false }),
    getCampaignSpend(supabase, campaign.id),
  ]);

  const enrolled = !!enrollment;
  const budget = campaign.budget_usd != null ? Number(campaign.budget_usd) : null;
  const remaining = budget != null ? Math.max(0, budget - spent) : null;
  const budgetExhausted = budget != null && spent >= budget;

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[
          { label: "FLICK CLIPPING", href: "/dashboard" },
          { label: "CAMPAIGNS", href: "/dashboard/campaigns" },
          { label: campaign.name.toUpperCase() },
        ]}
        showLogout
      />
      <ClipperNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h1 className="font-mono text-xl">{campaign.name}</h1>
            <span
              className={`font-mono text-[10px] uppercase tracking-widest ${
                open ? "text-accent" : "text-text-3"
              }`}
            >
              {open ? "open" : "closed"}
            </span>
          </div>
          {campaign.description && (
            <p className="font-mono text-sm text-text-2 max-w-2xl whitespace-pre-wrap">
              {campaign.description}
            </p>
          )}
          {campaign.brief_url && (
            <a
              href={campaign.brief_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-accent hover:underline"
            >
              open campaign brief →
            </a>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border border-border p-4 font-mono text-xs">
            <div>
              <div className="text-text-3 text-[10px] uppercase tracking-widest">cpm</div>
              <div>{fmtUsd(campaign.cpm_rate)} / 1k</div>
            </div>
            <div>
              <div className="text-text-3 text-[10px] uppercase tracking-widest">cap / clip</div>
              <div>{fmtUsd(campaign.max_payout_per_clip)}</div>
            </div>
            <div>
              <div className="text-text-3 text-[10px] uppercase tracking-widest">tracking</div>
              <div>{campaign.tracking_days} days</div>
            </div>
            <div>
              <div className="text-text-3 text-[10px] uppercase tracking-widest">budget</div>
              <div>
                {budget != null ? (
                  <>
                    {fmtUsd(remaining ?? 0)} left
                    <span className="text-text-3"> / {fmtUsd(budget)}</span>
                  </>
                ) : (
                  "uncapped"
                )}
              </div>
            </div>
          </div>

          {(campaign.starts_at || campaign.ends_at) && (
            <div className="font-mono text-[11px] text-text-3">
              {campaign.starts_at && (
                <>starts {new Date(campaign.starts_at).toISOString().slice(0, 10)} · </>
              )}
              {campaign.ends_at && (
                <>ends {new Date(campaign.ends_at).toISOString().slice(0, 10)}</>
              )}
            </div>
          )}
        </div>

        {!enrolled ? (
          <div className="border border-border p-5 flex flex-col gap-3">
            <span className="label">enroll to start clipping</span>
            <p className="font-mono text-xs text-text-2">
              Enrolling unlocks the submit form for this campaign. You can be enrolled in
              multiple campaigns at once.
            </p>
            {open ? (
              <EnrollCampaignButton campaignId={campaign.id} />
            ) : (
              <p className="font-mono text-xs text-danger">
                Campaign is closed — enrollment unavailable.
              </p>
            )}
          </div>
        ) : !open ? (
          <div className="border border-border p-5">
            <p className="font-mono text-xs text-text-2">
              <span className="text-danger">// campaign closed —</span> no new submissions
              accepted.
            </p>
          </div>
        ) : budgetExhausted ? (
          <div className="border border-border p-5">
            <p className="font-mono text-xs text-text-2">
              <span className="text-danger">// budget exhausted —</span> this campaign has paid
              out its full budget.
            </p>
          </div>
        ) : (
          <SubmitClipForm campaignId={campaign.id} campaignName={campaign.name} />
        )}

        <section className="flex flex-col gap-3">
          <h2 className="label">your clips for this campaign</h2>
          {clips && clips.length > 0 ? (
            <ClipsTable clips={clips as Clip[]} />
          ) : (
            <p className="font-mono text-xs text-text-3">No clips submitted yet.</p>
          )}
        </section>

        <Link
          href={"/dashboard/campaigns" as never}
          className="font-mono text-[11px] text-text-3 hover:text-text"
        >
          ← all campaigns
        </Link>
      </main>
    </div>
  );
}
