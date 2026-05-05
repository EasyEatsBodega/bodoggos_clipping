import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
