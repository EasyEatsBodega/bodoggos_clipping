import { NextResponse } from "next/server";
import { campaignClipperRatesSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

// PUT: set this clipper's rates in this campaign.
// Body: { weekly_base_pay_usd, cpm_rate, max_payout_per_clip,
//         sponsored_bonus_usd } — each a number, or null to fall back to
// the clipper-wide override / campaign default. All null clears the row.
// Applies to clips submitted (or tagged sponsored) after the save; clips
// already submitted keep the rates snapshotted on them.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; clipperId: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, clipperId } = await params;
  const body = await req.json().catch(() => null);
  const parsed = campaignClipperRatesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { data: enrollment } = await auth.admin
    .from("campaign_enrollments")
    .select("clipper_id")
    .eq("campaign_id", id)
    .eq("clipper_id", clipperId)
    .maybeSingle();
  if (!enrollment) {
    return NextResponse.json(
      { error: "clipper is not enrolled in this campaign" },
      { status: 404 },
    );
  }

  const rates = parsed.data;
  const allDefault = Object.values(rates).every((v) => v == null);
  if (allDefault) {
    const { error } = await auth.admin
      .from("campaign_clipper_rates")
      .delete()
      .eq("campaign_id", id)
      .eq("clipper_id", clipperId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await auth.admin.from("campaign_clipper_rates").upsert(
    {
      campaign_id: id,
      clipper_id: clipperId,
      weekly_base_pay_usd: rates.weekly_base_pay_usd,
      cpm_rate: rates.cpm_rate,
      max_payout_per_clip: rates.max_payout_per_clip,
      sponsored_bonus_usd: rates.sponsored_bonus_usd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "campaign_id,clipper_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: remove the clipper from this campaign, along with their rates
// here. Their existing clips stay (and keep paying out); they just can't
// submit new ones until re-enrolled.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; clipperId: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, clipperId } = await params;
  const [{ error: enrErr }, { error: ratesErr }] = await Promise.all([
    auth.admin
      .from("campaign_enrollments")
      .delete()
      .eq("campaign_id", id)
      .eq("clipper_id", clipperId),
    auth.admin
      .from("campaign_clipper_rates")
      .delete()
      .eq("campaign_id", id)
      .eq("clipper_id", clipperId),
  ]);
  const error = enrErr ?? ratesErr;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
