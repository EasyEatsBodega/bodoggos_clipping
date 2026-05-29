import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  // payout_clip_marks has ON DELETE CASCADE on payout_id, so the per-clip
  // watermarks attached to this payout are removed too — which is exactly
  // what we want when undoing an incorrectly entered payment, since the
  // clipper's outstanding balance recalculates against the prior watermark.
  const { error } = await auth.admin.from("payouts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
