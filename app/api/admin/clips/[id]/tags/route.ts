import { NextResponse } from "next/server";
import { setClipTagsSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

// Replace the full set of tags for a clip with the provided list.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = setClipTagsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { data: clip, error: clipErr } = await auth.admin
    .from("clips")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (clipErr || !clip) {
    return NextResponse.json({ error: "clip not found" }, { status: 404 });
  }

  const { error: delErr } = await auth.admin
    .from("clip_tag_assignments")
    .delete()
    .eq("clip_id", id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (parsed.data.tag_ids.length > 0) {
    const rows = parsed.data.tag_ids.map((tag_id) => ({
      clip_id: id,
      tag_id,
      assigned_by: auth.user.id,
    }));
    const { error: insErr } = await auth.admin
      .from("clip_tag_assignments")
      .insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: parsed.data.tag_ids.length });
}
