import { NextResponse } from "next/server";
import { rosterActiveSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

// POST: set a clipper's roster status. Body: { active: boolean }.
// Inactive clippers can still sign in and see history, but new clip
// submissions are rejected (see /api/clips). Existing clips keep
// tracking and paying out — deactivation is forward-looking only.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = rosterActiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { error } = await auth.admin
    .from("clippers")
    .update({ roster_active: parsed.data.active })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
