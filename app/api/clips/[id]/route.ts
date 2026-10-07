import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clipSponsoredSchema } from "@/lib/validators";
import { getSponsoredTag } from "@/lib/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: clip, error } = await supabase
    .from("clips")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!clip) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: snapshots } = await supabase
    .from("clip_impression_snapshots")
    .select("impressions, captured_at, source")
    .eq("clip_id", id)
    .order("captured_at", { ascending: true });

  return NextResponse.json({ clip, snapshots: snapshots ?? [] });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  // RLS (clips_self_delete) enforces clipper_id = auth.uid(). Snapshots cascade.
  // We also assert the row was deleted so we can return a clean 404 if not.
  const { data, error } = await supabase
    .from("clips")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

// Clipper toggles the sponsored disclosure on their own clip. Assignment
// writes are admin-only under RLS (same as the creator tag at submit), so
// after proving ownership with the RLS-scoped client we write with the
// service-role client.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = clipSponsoredSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const { data: clip } = await supabase
    .from("clips")
    .select("id, clipper_id")
    .eq("id", id)
    .maybeSingle();
  if (!clip || clip.clipper_id !== user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const admin = createSupabaseAdminClient();
  const sponsoredTag = await getSponsoredTag(admin);
  if (!sponsoredTag) {
    return NextResponse.json(
      { error: "sponsored marking is not available right now" },
      { status: 400 },
    );
  }

  if (parsed.data.sponsored) {
    const { error } = await admin
      .from("clip_tag_assignments")
      .upsert(
        { clip_id: clip.id, tag_id: sponsoredTag.id },
        { onConflict: "clip_id,tag_id", ignoreDuplicates: true },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await admin
      .from("clip_tag_assignments")
      .delete()
      .eq("clip_id", clip.id)
      .eq("tag_id", sponsoredTag.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sponsored: parsed.data.sponsored });
}
