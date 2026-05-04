import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { StatCell, StatGrid } from "@/components/ui/StatCell";
import { SubmitClipForm } from "@/components/clipper/SubmitClipForm";
import { ClipsTable } from "@/components/clipper/ClipsTable";
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

  const [{ data: clips }, kpis] = await Promise.all([
    supabase
      .from("clips")
      .select("*")
      .eq("clipper_id", user.id)
      .order("submitted_at", { ascending: false }),
    getClipperKpis(supabase, user.id),
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[
          { label: "CLIPPER.OPS", href: "/dashboard" },
          { label: `@${clipper.x_handle}` },
        ]}
        showLogout
      />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-8">
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

        <SubmitClipForm />

        <section className="flex flex-col gap-3">
          <h2 className="label">clips</h2>
          <ClipsTable clips={(clips ?? []) as Clip[]} />
        </section>
      </main>
    </div>
  );
}
