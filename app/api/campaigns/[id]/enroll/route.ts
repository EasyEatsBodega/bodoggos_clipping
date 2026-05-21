import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCampaignOpen } from "@/lib/queries";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const { data: clipper } = await supabase
    .from("clippers")
    .select("id, banned")
    .eq("id", user.id)
    .maybeSingle();
  if (!clipper) return NextResponse.json({ error: "no clipper profile" }, { status: 403 });
  if (clipper.banned) return NextResponse.json({ error: "account suspended" }, { status: 403 });

  const admin = createSupabaseAdminClient();
  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, active, starts_at, ends_at")
    .eq("id", id)
    .maybeSingle();
  if (!campaign) return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  if (!isCampaignOpen(campaign)) {
    return NextResponse.json({ error: "this campaign is not currently accepting clippers" }, { status: 400 });
  }

  const { error } = await admin
    .from("campaign_enrollments")
    .insert({ clipper_id: user.id, campaign_id: campaign.id });
  // 23505 = unique violation (already enrolled) — treat as success
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
