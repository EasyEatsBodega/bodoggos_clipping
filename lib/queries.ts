import type { SupabaseClient } from "@supabase/supabase-js";
import { sumNumeric } from "./payout-calc";

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
