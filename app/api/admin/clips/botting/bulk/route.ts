import { NextResponse } from "next/server";
import { bulkBottingMarkSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

// POST: mark many clips as suspected engagement farming in one shot.
// Body: { clip_ids: string[], reason: string }
//
// Same per-clip semantics as the single-clip route:
//   - Sets botting_suspected / botting_reason / marked_at / marked_by
//   - Zeros payout_amount for completed clips so totals reflect exclusion
//   - Auto-resolves any open clip_flag on each affected clip
//
// Returns { ok, marked, flags_resolved }.
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = bulkBottingMarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  const { clip_ids, reason } = parsed.data;

  const nowIso = new Date().toISOString();

  // We have to bifurcate: completed clips need payout_amount zeroed, others
  // don't. One update with the common columns, one targeted at completed
  // clips for the payout zero.
  const { error: markErr } = await auth.admin
    .from("clips")
    .update({
      botting_suspected: true,
      botting_reason: reason,
      botting_marked_at: nowIso,
      botting_marked_by: auth.user.id,
    })
    .in("id", clip_ids);
  if (markErr) {
    return NextResponse.json({ error: markErr.message }, { status: 500 });
  }

  const { error: zeroErr } = await auth.admin
    .from("clips")
    .update({ payout_amount: "0.00" })
    .in("id", clip_ids)
    .eq("status", "completed");
  if (zeroErr) {
    return NextResponse.json({ error: zeroErr.message }, { status: 500 });
  }

  // Auto-resolve any open clip_flags on the marked clips, same as the
  // single-clip botting route does.
  const { error: flagErr, count: resolvedCount } = await auth.admin
    .from("clip_flags")
    .update(
      {
        resolved_at: nowIso,
        resolved_by: auth.user.id,
        resolution: "marked as botting",
      },
      { count: "exact" },
    )
    .in("clip_id", clip_ids)
    .is("resolved_at", null);
  if (flagErr) {
    return NextResponse.json({ error: flagErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    marked: clip_ids.length,
    flags_resolved: resolvedCount ?? 0,
  });
}
