import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  if (id === auth.user.id) {
    return NextResponse.json({ error: "cannot delete your own account" }, { status: 400 });
  }

  // Refuse if any payouts reference this clipper — accounting history must survive.
  const { count: payoutCount, error: payoutErr } = await auth.admin
    .from("payouts")
    .select("id", { count: "exact", head: true })
    .eq("clipper_id", id);
  if (payoutErr) return NextResponse.json({ error: payoutErr.message }, { status: 500 });
  if ((payoutCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "this clipper has payout history; ban them instead of deleting" },
      { status: 409 },
    );
  }

  // clips have ON DELETE CASCADE on clipper_id, snapshots on clip_id, so both are wiped.
  const { error } = await auth.admin.from("clippers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort: also remove the auth.users row so the email/handle are reusable.
  // If this fails (older Supabase versions / permissions) we ignore it; the public row is gone.
  try {
    await auth.admin.auth.admin.deleteUser(id);
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true });
}
