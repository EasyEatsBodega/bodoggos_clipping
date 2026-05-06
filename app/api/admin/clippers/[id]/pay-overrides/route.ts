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
  const { data: campaign, error: campErr } = await auth.admin
    .from("campaigns")
    .select("cpm_rate, max_payout_per_clip")
    .eq("active", true)
    .maybeSingle();
  if (campErr || !campaign) {
    return NextResponse.json({ error: "no active campaign for backfill" }, { status: 500 });
  }

  const effectiveCpm = parsed.data.cpm_rate_override ?? campaign.cpm_rate;
  const effectiveMax = parsed.data.max_payout_override ?? campaign.max_payout_per_clip;
  const effectiveFlat = parsed.data.flat_fee_per_clip;

  const { data: clips, error: clipsErr } = await auth.admin
    .from("clips")
    .select("id, status, impressions, final_impressions")
    .eq("clipper_id", id);
  if (clipsErr) return NextResponse.json({ error: clipsErr.message }, { status: 500 });

  let backfilled = 0;
  let recomputed = 0;
  for (const c of clips ?? []) {
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
