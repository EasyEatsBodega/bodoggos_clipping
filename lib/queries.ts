import type { SupabaseClient } from "@supabase/supabase-js";
import { billableImpressions, sumNumeric } from "./payout-calc";

export async function getActiveCampaign(supabase: SupabaseClient) {
  const { data } = await supabase.from("campaigns").select("*").eq("active", true).maybeSingle();
  return data;
}

export type ClipperKpis = {
  totalClips: number;
  totalImpressions: number;
  totalEarned: string;
  totalPaid: string;
  outstanding: string;
};

export async function getClipperKpis(
  supabase: SupabaseClient,
  clipperId: string,
): Promise<ClipperKpis> {
  const [{ data: clips }, { data: payouts }] = await Promise.all([
    supabase
      .from("clips")
      .select("impressions, final_impressions, payout_amount, status")
      .eq("clipper_id", clipperId),
    supabase.from("payouts").select("amount").eq("clipper_id", clipperId),
  ]);

  const totalClips = clips?.length ?? 0;
  const totalImpressions =
    clips?.reduce(
      (s, c) => s + Number(c.final_impressions ?? c.impressions ?? 0),
      0,
    ) ?? 0;
  const totalEarned = sumNumeric(clips?.map((c) => c.payout_amount) ?? []);
  const totalPaid = sumNumeric(payouts?.map((p) => p.amount) ?? []);
  const outstanding = (() => {
    const earnedCents = Math.round(Number(totalEarned) * 100);
    const paidCents = Math.round(Number(totalPaid) * 100);
    const cents = Math.max(0, earnedCents - paidCents);
    const dollars = Math.floor(cents / 100);
    const rem = cents % 100;
    return `${dollars}.${rem.toString().padStart(2, "0")}`;
  })();

  return { totalClips, totalImpressions, totalEarned, totalPaid, outstanding };
}

// Snapshots the current billable impression count for every non-rejected
// clip belonging to a clipper as a payout_clip_marks row attached to the
// just-inserted payout. The next "rolling owed" calc will only count
// impressions above these watermarks. Errors are swallowed (logged) — the
// payment is the source of truth, marks are an accounting refinement; if
// they fail the next payout will overpay slightly rather than block a
// confirmed transfer from being recorded.
export async function snapshotClipMarks(
  supabase: SupabaseClient,
  payoutId: string,
  clipperId: string,
): Promise<void> {
  const { data: clips, error } = await supabase
    .from("clips")
    .select("id, status, impressions, final_impressions")
    .eq("clipper_id", clipperId)
    .neq("status", "rejected");
  if (error || !clips) {
    console.error("snapshotClipMarks: failed to read clips", error);
    return;
  }
  if (clips.length === 0) return;

  const rows = clips.map((c) => ({
    payout_id: payoutId,
    clip_id: c.id,
    impressions_at_mark: billableImpressions({
      id: c.id,
      status: c.status,
      impressions: c.impressions,
      final_impressions: c.final_impressions,
      cpm_rate_snapshot: 0,
      max_payout_snapshot: 0,
      flat_fee_snapshot: 0,
    }),
  }));
  const { error: insErr } = await supabase
    .from("payout_clip_marks")
    .insert(rows);
  if (insErr) {
    console.error("snapshotClipMarks: failed to insert marks", insErr);
  }
}
