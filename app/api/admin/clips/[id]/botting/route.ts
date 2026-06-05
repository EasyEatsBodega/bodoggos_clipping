import { NextResponse } from "next/server";
import { bottingMarkSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";
import { computePayoutAmount } from "@/lib/payout-calc";

// POST: mark a clip as suspected engagement farming. Body: { reason }.
// Completed clips have their payout_amount zeroed so the "earned (finalized)"
// totals immediately reflect the exclusion.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = bottingMarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { data: clip, error: getErr } = await auth.admin
    .from("clips")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (getErr || !clip) return NextResponse.json({ error: "not found" }, { status: 404 });

  const update: Record<string, unknown> = {
    botting_suspected: true,
    botting_reason: parsed.data.reason,
    botting_marked_at: new Date().toISOString(),
    botting_marked_by: auth.user.id,
  };
  if (clip.status === "completed") {
    update.payout_amount = "0.00";
  }

  const { error } = await auth.admin.from("clips").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Confirming botting closes out any open flags on this clip — typically
  // the auto-generated ones from the bot-flag cron — so the /admin/flags
  // inbox doesn't keep showing them after the call has been made.
  await auth.admin
    .from("clip_flags")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: auth.user.id,
      resolution: "marked as botting",
    })
    .eq("clip_id", id)
    .is("resolved_at", null);

  return NextResponse.json({ ok: true });
}

// DELETE: clear the suspected-botting mark and recompute payout_amount for
// completed clips from the current impression count.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  const { data: clip, error: getErr } = await auth.admin
    .from("clips")
    .select(
      "id, status, impressions, final_impressions, cpm_rate_snapshot, max_payout_snapshot, flat_fee_snapshot, min_views_snapshot",
    )
    .eq("id", id)
    .maybeSingle();
  if (getErr || !clip) return NextResponse.json({ error: "not found" }, { status: 404 });

  const update: Record<string, unknown> = {
    botting_suspected: false,
    botting_reason: null,
    botting_marked_at: null,
    botting_marked_by: null,
  };
  if (clip.status === "completed") {
    update.payout_amount = computePayoutAmount(
      clip.final_impressions ?? clip.impressions ?? 0,
      clip.cpm_rate_snapshot,
      clip.max_payout_snapshot,
      clip.flat_fee_snapshot ?? 0,
      clip.min_views_snapshot ?? 0,
    );
  }

  const { error } = await auth.admin.from("clips").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
