import { NextResponse } from "next/server";
import { campaignConfigSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = campaignConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { error } = await auth.admin
    .from("campaigns")
    .update({
      name: parsed.data.name,
      cpm_rate: parsed.data.cpm_rate.toFixed(2),
      max_payout_per_clip: parsed.data.max_payout_per_clip.toFixed(2),
      tracking_days: parsed.data.tracking_days,
      active: parsed.data.active,
      description: parsed.data.description ?? null,
      brief_url: parsed.data.brief_url ?? null,
      starts_at: parsed.data.starts_at ?? null,
      ends_at: parsed.data.ends_at ?? null,
      budget_usd: parsed.data.budget_usd != null ? parsed.data.budget_usd.toFixed(2) : null,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  // Refuse to delete if any clips reference this campaign — orphaning their
  // foreign key would lose payout history. Admin can deactivate instead.
  const { count } = await auth.admin
    .from("clips")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "this campaign has clips; deactivate it instead of deleting" },
      { status: 409 },
    );
  }

  const { error } = await auth.admin.from("campaigns").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
