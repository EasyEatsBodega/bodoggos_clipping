import { NextResponse } from "next/server";
import { banSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = banSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  if (parsed.data.banned && id === auth.user.id) {
    return NextResponse.json({ error: "cannot ban yourself" }, { status: 400 });
  }

  const update = parsed.data.banned
    ? {
        banned: true,
        banned_at: new Date().toISOString(),
        banned_reason: parsed.data.reason ?? null,
      }
    : { banned: false, banned_at: null, banned_reason: null };

  const { error } = await auth.admin.from("clippers").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
