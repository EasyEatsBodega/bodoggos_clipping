import Link from "next/link";
import { Header } from "@/components/Header";
import { AdminNav } from "@/components/admin/AdminNav";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCampaignSpend, isCampaignOpen } from "@/lib/queries";
import { fmtUsd } from "@/lib/format";
import type { Campaign } from "@/lib/db-types";

export const dynamic = "force-dynamic";

export default async function AdminCampaignsPage() {
  const admin = createSupabaseAdminClient();
  const { data: campaigns } = await admin
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });

  const rows = (campaigns ?? []) as Campaign[];

  const enriched = await Promise.all(
    rows.map(async (c) => {
      const [{ count: clipCount }, { count: enrollmentCount }, spent] = await Promise.all([
        admin
          .from("clips")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", c.id),
        admin
          .from("campaign_enrollments")
          .select("clipper_id", { count: "exact", head: true })
          .eq("campaign_id", c.id),
        getCampaignSpend(admin, c.id),
      ]);
      return {
        ...c,
        clipCount: clipCount ?? 0,
        enrollmentCount: enrollmentCount ?? 0,
        spent,
      };
    }),
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "CAMPAIGNS" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-6">
        <div className="flex items-baseline justify-between">
          <h1 className="label">campaigns</h1>
          <Link
            href={"/admin/campaigns/new" as never}
            className="font-mono text-[11px] uppercase tracking-widest text-admin hover:underline"
          >
            + new campaign
          </Link>
        </div>

        {enriched.length === 0 ? (
          <p className="font-mono text-sm text-text-2">
            No campaigns yet. Create one to start onboarding clippers.
          </p>
        ) : (
          <div className="border border-border">
            <table className="w-full font-mono text-xs">
              <thead>
                <tr className="border-b border-border text-text-3 text-[10px] uppercase tracking-widest">
                  <th className="text-left p-3">name</th>
                  <th className="text-left p-3">status</th>
                  <th className="text-right p-3">cpm</th>
                  <th className="text-right p-3">cap</th>
                  <th className="text-right p-3">min views</th>
                  <th className="text-right p-3">budget</th>
                  <th className="text-right p-3">spent</th>
                  <th className="text-right p-3">clippers</th>
                  <th className="text-right p-3">clips</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((c) => {
                  const open = isCampaignOpen(c);
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="p-3">
                        <Link
                          href={`/admin/campaigns/${c.id}` as never}
                          className="hover:text-admin"
                        >
                          <div>{c.name}</div>
                          <div className="text-text-3 text-[10px]">{c.slug}</div>
                        </Link>
                      </td>
                      <td className="p-3">
                        <span
                          className={
                            open
                              ? "text-accent"
                              : c.active
                                ? "text-text-3"
                                : "text-admin"
                          }
                        >
                          {open ? "live" : c.active ? "scheduled" : "draft"}
                        </span>
                      </td>
                      <td className="p-3 text-right">{fmtUsd(c.cpm_rate)}</td>
                      <td className="p-3 text-right">{fmtUsd(c.max_payout_per_clip)}</td>
                      <td className="p-3 text-right">
                        {c.min_views != null && c.min_views > 0
                          ? c.min_views.toLocaleString()
                          : "—"}
                      </td>
                      <td className="p-3 text-right">
                        {c.budget_usd != null ? fmtUsd(c.budget_usd) : "—"}
                      </td>
                      <td className="p-3 text-right">{fmtUsd(c.spent)}</td>
                      <td className="p-3 text-right">{c.enrollmentCount}</td>
                      <td className="p-3 text-right">{c.clipCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
