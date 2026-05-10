import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";

// Revoke admin access. Removes the admin_users row but leaves the
// underlying auth.users record intact (so the same account can still
// sign in as a non-admin if there's a separate role later). Self-delete
// is blocked so the last admin can't lock themselves out by accident.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  if (id === auth.user.id) {
    return NextResponse.json(
      { error: "you can't remove your own admin access" },
      { status: 400 },
    );
  }

  const { error } = await auth.admin.from("admin_users").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
