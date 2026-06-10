import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";

// POST: dismiss a clip from the bot review queue ("reviewed — not botting").
// Resolves any open flags on the clip; if it was never flagged (it only
// appeared on /admin/clips/review via its score), inserts a pre-resolved
// flag row as the review record. Either way the clip then carries a
// resolved flag, which both the review page and the bot-flag cron treat as
// "human reviewed — don't resurface".
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  const { data: clip } = await auth.admin
    .from("clips")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!clip) return NextResponse.json({ error: "not found" }, { status: 404 });

  const now = new Date().toISOString();
  const resolution = "reviewed — not botting";

  const { data: resolved, error: resolveErr } = await auth.admin
    .from("clip_flags")
    .update({ resolved_at: now, resolved_by: auth.user.id, resolution })
    .eq("clip_id", id)
    .is("resolved_at", null)
    .select("id");
  if (resolveErr) {
    return NextResponse.json({ error: resolveErr.message }, { status: 500 });
  }

  if (!resolved || resolved.length === 0) {
    const { error: insertErr } = await auth.admin.from("clip_flags").insert({
      clip_id: id,
      reason: "[review] dismissed from bot review",
      flagged_by: auth.user.id,
      resolved_at: now,
      resolved_by: auth.user.id,
      resolution,
    });
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, flags_resolved: resolved?.length ?? 0 });
}
