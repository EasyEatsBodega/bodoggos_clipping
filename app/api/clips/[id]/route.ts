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
