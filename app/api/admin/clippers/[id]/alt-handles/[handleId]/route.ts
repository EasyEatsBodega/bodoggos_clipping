import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";

// DELETE: remove a whitelisted alternate handle from this clipper.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; handleId: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, handleId } = await params;
  const { error } = await auth.admin
    .from("clipper_alt_handles")
    .delete()
    .eq("id", handleId)
    .eq("clipper_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
