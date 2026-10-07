import type { SupabaseClient } from "@supabase/supabase-js";
import { computePayoutAmount } from "./payout-calc";
import { getSponsoredTag } from "./queries";

// Keeps a clip's money in step with its "sponsored" tag.
//
//   tagged   ⇒ flat_fee_snapshot includes the campaign's sponsored bonus and
//              sponsored_bonus_snapshot records how much that was
//   untagged ⇒ neither
//
// Folding the bonus into flat_fee_snapshot means finalize, rolling owed,
// tax, budget and the exports all count it with no special cases; the
// separate component column lets us remove exactly what was added, and
// lets per-clipper override backfills preserve it. Idempotent — every path
// that can change the tag (clipper submit / toggle, admin TagPicker) calls
// it after writing the assignment. Completed clips get payout_amount
// recomputed so the bonus lands in earned / outstanding right away;
// tracking clips pick it up at finalize through the snapshot. Snapshots
// are immutable once taken: a tagged clip keeps the bonus it was tagged
// with even if the campaign setting changes later.
export async function syncSponsoredBonus(
  admin: SupabaseClient,
  clipId: string,
): Promise<{ changed: boolean; bonus: number }> {
  const tag = await getSponsoredTag(admin);
  if (!tag) return { changed: false, bonus: 0 };

  const [{ data: assignment }, { data: clip }] = await Promise.all([
    admin
      .from("clip_tag_assignments")
      .select("clip_id")
      .eq("clip_id", clipId)
      .eq("tag_id", tag.id)
      .maybeSingle(),
    admin
      .from("clips")
      .select(
        "id, campaign_id, status, impressions, final_impressions, cpm_rate_snapshot, max_payout_snapshot, flat_fee_snapshot, min_views_snapshot, sponsored_bonus_snapshot, botting_suspected",
      )
      .eq("id", clipId)
      .maybeSingle(),
  ]);
  if (!clip) return { changed: false, bonus: 0 };

  const tagged = !!assignment;
  const currentBonus = Number(clip.sponsored_bonus_snapshot ?? 0);
  const currentFlat = Number(clip.flat_fee_snapshot ?? 0);

  let nextBonus: number;
  if (tagged) {
    if (currentBonus > 0) return { changed: false, bonus: currentBonus };
    const { data: campaign } = await admin
      .from("campaigns")
      .select("sponsored_bonus_usd")
      .eq("id", clip.campaign_id)
      .maybeSingle();
    nextBonus = Number(campaign?.sponsored_bonus_usd ?? 0);
    if (nextBonus <= 0) return { changed: false, bonus: 0 };
  } else {
    if (currentBonus <= 0) return { changed: false, bonus: 0 };
    nextBonus = 0;
  }

  const nextFlat = Math.max(0, currentFlat - currentBonus + nextBonus);
  const update: Record<string, unknown> = {
    flat_fee_snapshot: nextFlat.toFixed(2),
    sponsored_bonus_snapshot: nextBonus.toFixed(2),
  };
  if (clip.status === "completed") {
    update.payout_amount = clip.botting_suspected
      ? "0.00"
      : computePayoutAmount(
          Number(clip.final_impressions ?? clip.impressions ?? 0),
          clip.cpm_rate_snapshot,
          clip.max_payout_snapshot,
          nextFlat,
          clip.min_views_snapshot ?? 0,
        );
  }
  const { error } = await admin.from("clips").update(update).eq("id", clipId);
  if (error) throw new Error(`sponsored bonus sync failed: ${error.message}`);
  return { changed: true, bonus: nextBonus };
}
