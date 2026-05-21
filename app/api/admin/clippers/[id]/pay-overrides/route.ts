import { NextResponse } from "next/server";
import { payOverridesSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";
import { computePayoutAmount } from "@/lib/payout-calc";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = payOverridesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { error: upErr } = await auth.admin
    .from("clippers")
    .update({
      flat_fee_per_clip: parsed.data.flat_fee_per_clip,
      cpm_rate_override: parsed.data.cpm_rate_override,
      max_payout_override: parsed.data.max_payout_override,
    })
    .eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  if (!parsed.data.apply_to_existing) {
    return NextResponse.json({ ok: true, backfilled: 0, recomputed: 0 });
  }

  // Backfill: rewrite snapshots on every existing clip for this clipper, and
  // recompute payout_amount for completed clips against final_impressions.
  // Each clip's snapshot is reset to (override ?? its-own-campaign-default),
  // so a clipper with clips across multiple campaigns keeps the correct
  // per-campaign rate where there's no override.
  const { data: clips, error: clipsErr } = await auth.admin
    .from("clips")
    .select("id, status, impressions, final_impressions, campaign_id")
    .eq("clipper_id", id);
  if (clipsErr) return NextResponse.json({ error: clipsErr.message }, { status: 500 });

  // Look up per-campaign defaults once, keyed by campaign_id, so each clip
  // can fall back to its own campaign's rate when the override is null.
  const campaignIds = Array.from(
    new Set((clips ?? []).map((c) => c.campaign_id)),
  );
  const campaignDefaults = new Map<string, { cpm_rate: string; max_payout_per_clip: string }>();
  if (campaignIds.length > 0) {
    const { data: camps, error: campsErr } = await auth.admin
      .from("campaigns")
      .select("id, cpm_rate, max_payout_per_clip")
      .in("id", campaignIds);
    if (campsErr) return NextResponse.json({ error: campsErr.message }, { status: 500 });
    for (const c of camps ?? []) {
      campaignDefaults.set(c.id, {
        cpm_rate: c.cpm_rate,
        max_payout_per_clip: c.max_payout_per_clip,
      });
    }
  }

  let backfilled = 0;
  let recomputed = 0;
  for (const c of clips ?? []) {
    const defaults = campaignDefaults.get(c.campaign_id);
    const campCpm = defaults?.cpm_rate ?? 0;
    const campMax = defaults?.max_payout_per_clip ?? 0;
    const effectiveCpm = parsed.data.cpm_rate_override ?? campCpm;
    const effectiveMax = parsed.data.max_payout_override ?? campMax;
    const effectiveFlat = parsed.data.flat_fee_per_clip;

    const update: Record<string, unknown> = {
      cpm_rate_snapshot: effectiveCpm,
      max_payout_snapshot: effectiveMax,
      flat_fee_snapshot: effectiveFlat,
    };
    if (c.status === "completed") {
      const finalImps = Number(c.final_impressions ?? c.impressions ?? 0);
      update.payout_amount = computePayoutAmount(
        finalImps,
        effectiveCpm,
        effectiveMax,
        effectiveFlat,
      );
      recomputed++;
    }
    const { error: clipUpErr } = await auth.admin.from("clips").update(update).eq("id", c.id);
    if (clipUpErr) {
      return NextResponse.json(
        { error: `partial backfill: failed on clip ${c.id}: ${clipUpErr.message}` },
        { status: 500 },
      );
    }
    backfilled++;
  }

  return NextResponse.json({ ok: true, backfilled, recomputed });
}
