import { NextResponse } from "next/server";
import { rejectClipSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = rejectClipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { data: clip, error: getErr } = await auth.admin
    .from("clips")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (getErr || !clip) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error: upErr } = await auth.admin
    .from("clips")
    .update({
      status: "rejected",
      rejected_reason: parsed.data.reason,
      payout_amount: null,
      final_impressions: null,
    })
    .eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
