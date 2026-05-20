import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { AdminNav } from "@/components/admin/AdminNav";
import { CampaignForm } from "@/components/admin/CampaignForm";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCampaignSpend } from "@/lib/queries";
import { fmtUsd } from "@/lib/format";
import type { Campaign } from "@/lib/db-types";

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

  const [{ count: clipCount }, { count: enrollmentCount }, spent] = await Promise.all([
    admin.from("clips").select("id", { count: "exact", head: true }).eq("campaign_id", id),
    admin
      .from("campaign_enrollments")
      .select("clipper_id", { count: "exact", head: true })
      .eq("campaign_id", id),
    getCampaignSpend(admin, id),
  ]);

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
        <div className="flex flex-col gap-1">
          <h1 className="font-mono text-xl">{campaign.name}</h1>
          <p className="font-mono text-xs text-text-3">slug: {campaign.slug}</p>
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
            <div>{enrollmentCount ?? 0} enrolled</div>
          </div>
          <div>
            <div className="text-text-3 text-[10px] uppercase tracking-widest">clips</div>
            <div>{clipCount ?? 0}</div>
          </div>
        </div>

        <p className="font-mono text-xs text-text-2 max-w-2xl">
          Changes apply only to clips submitted <em>after</em> the change. Clips already in
          flight keep the rate and cap snapshotted at submit time.
        </p>
        <CampaignForm mode="edit" campaign={campaign} />
      </main>
    </div>
  );
}
