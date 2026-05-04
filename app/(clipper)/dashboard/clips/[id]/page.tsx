import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { StatCell, StatGrid } from "@/components/ui/StatCell";
import { SnapshotChart } from "@/components/clipper/SnapshotChart";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fmtCountdown, fmtInt, fmtRelative, fmtUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ClipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/");

  const { data: clip } = await supabase
    .from("clips")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!clip || clip.clipper_id !== user.id) notFound();

  const { data: snapshots } = await supabase
    .from("clip_impression_snapshots")
    .select("impressions, captured_at")
    .eq("clip_id", id)
    .order("captured_at", { ascending: true });

  const points =
    snapshots?.map((s) => ({
      t: new Date(s.captured_at).getTime(),
      impressions: s.impressions,
    })) ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[
          { label: "CLIPPER.OPS", href: "/dashboard" },
          { label: "CLIPS", href: "/dashboard" },
          { label: clip.tweet_id },
        ]}
        showLogout
      />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-8">
        <div className="flex items-baseline justify-between">
          <a
            href={clip.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm text-accent hover:underline"
          >
            {clip.url} ↗
          </a>
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-2">
            submitted {fmtRelative(clip.submitted_at)}
          </span>
        </div>

        <StatGrid>
          <StatCell label="status" value={clip.status} accent={clip.status === "rejected" ? "danger" : "accent"} />
          <StatCell label="impressions" value={fmtInt(clip.final_impressions ?? clip.impressions)} />
          <StatCell
            label="window"
            value={clip.status === "tracking" ? fmtCountdown(clip.tracking_until) : "—"}
          />
          <StatCell
            label={clip.status === "completed" ? "earned" : "estimated"}
            value={fmtUsd(clip.payout_amount ?? estimatePayout(clip))}
            accent="accent"
          />
        </StatGrid>

        <section className="flex flex-col gap-3">
          <h2 className="label">impressions over time</h2>
          <SnapshotChart data={points} />
        </section>

        {clip.status === "rejected" && clip.rejected_reason && (
          <p className="font-mono text-xs text-danger">rejected: {clip.rejected_reason}</p>
        )}

        <Link
          href={"/dashboard" as never}
          className="font-mono text-[10px] uppercase tracking-widest text-text-2 hover:text-text"
        >
          ← back
        </Link>
      </main>
    </div>
  );
}

function estimatePayout(clip: {
  impressions: number;
  cpm_rate_snapshot: string;
  max_payout_snapshot: string;
}): string {
  const rateCents = Math.round(Number(clip.cpm_rate_snapshot) * 100);
  const capCents = Math.round(Number(clip.max_payout_snapshot) * 100);
  const earned = Math.floor((clip.impressions * rateCents) / 1000);
  const cents = Math.min(earned, capCents);
  return (cents / 100).toFixed(2);
}
