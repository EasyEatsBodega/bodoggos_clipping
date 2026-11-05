import { NextResponse } from "next/server";
import { addCampaignClipperSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

// POST: enroll a clipper into this campaign on their behalf.
// Body: { clipper_id }
// Unlike the clipper-facing enroll route this works on drafts and closed
// campaigns too, so an admin can line up a ghostwriter (and their rates)
// before the campaign goes live.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = addCampaignClipperSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const [{ data: campaign }, { data: clipper }] = await Promise.all([
    auth.admin.from("campaigns").select("id").eq("id", id).maybeSingle(),
    auth.admin
      .from("clippers")
      .select("id, banned")
      .eq("id", parsed.data.clipper_id)
      .maybeSingle(),
  ]);
  if (!campaign) return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  if (!clipper) return NextResponse.json({ error: "clipper not found" }, { status: 404 });
  if (clipper.banned) {
    return NextResponse.json({ error: "this clipper is banned" }, { status: 400 });
  }

  const { error } = await auth.admin
    .from("campaign_enrollments")
    .insert({ clipper_id: clipper.id, campaign_id: campaign.id });
  // 23505 = unique violation (already enrolled) — treat as success
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
