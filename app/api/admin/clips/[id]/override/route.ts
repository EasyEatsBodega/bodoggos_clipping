import { NextResponse } from "next/server";
import { overrideClipSchema } from "@/lib/validators";
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
  const parsed = overrideClipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { data: clip, error: getErr } = await auth.admin
    .from("clips")
    .select("id, status, cpm_rate_snapshot, max_payout_snapshot, flat_fee_snapshot")
    .eq("id", id)
    .maybeSingle();
  if (getErr || !clip) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Insert audit snapshot
  await auth.admin.from("clip_impression_snapshots").insert({
    clip_id: id,
    impressions: parsed.data.impressions,
    source: "admin_manual",
  });

  // If completed, recompute payout based on overridden impressions.
  const baseUpdate: Record<string, unknown> = {
    impressions: parsed.data.impressions,
    admin_override_impressions: parsed.data.impressions,
    admin_override_reason: parsed.data.reason,
  };
  if (clip.status === "completed") {
    baseUpdate.final_impressions = parsed.data.impressions;
    baseUpdate.payout_amount = computePayoutAmount(
      parsed.data.impressions,
      clip.cpm_rate_snapshot,
      clip.max_payout_snapshot,
      clip.flat_fee_snapshot ?? 0,
    );
  }

  const { error: upErr } = await auth.admin.from("clips").update(baseUpdate).eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
