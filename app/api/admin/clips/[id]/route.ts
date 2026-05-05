import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  // clip_impression_snapshots have ON DELETE CASCADE on clip_id, so they go too.
  const { error } = await auth.admin.from("clips").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
