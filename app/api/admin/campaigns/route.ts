import { NextResponse } from "next/server";
import { createCampaignSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("campaigns")
    .insert({
      slug: parsed.data.slug,
      name: parsed.data.name,
      cpm_rate: parsed.data.cpm_rate.toFixed(2),
      max_payout_per_clip: parsed.data.max_payout_per_clip.toFixed(2),
      tracking_days: parsed.data.tracking_days,
      min_views: parsed.data.min_views ?? null,
      active: parsed.data.active,
      description: parsed.data.description ?? null,
      brief_url: parsed.data.brief_url ?? null,
      starts_at: parsed.data.starts_at ?? null,
      ends_at: parsed.data.ends_at ?? null,
      budget_usd: parsed.data.budget_usd != null ? parsed.data.budget_usd.toFixed(2) : null,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "a campaign with that slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ campaign: data });
}
