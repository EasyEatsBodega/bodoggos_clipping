import { NextResponse } from "next/server";
import { flagSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = flagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { data: clipper, error: getErr } = await auth.admin
    .from("clippers")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (getErr || !clipper) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await auth.admin.from("clipper_flags").insert({
    clipper_id: id,
    reason: parsed.data.reason,
    flagged_by: auth.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
