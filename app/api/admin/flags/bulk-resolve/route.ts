import { NextResponse } from "next/server";
import { bulkResolveFlagsSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

// POST: resolve many open clip flags at once. Body: { flag_ids?, clip_ids?,
// resolution? } — pass flag ids directly (from /admin/flags) or clip ids
// (from a clips table selection; resolves every open flag on those clips).
// Built for clearing false positives from the daily bot-flag cron in one
// pass instead of clicking resolve per row. Already-resolved flags are
// skipped (the .is filter), so re-submits are harmless.
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = bulkResolveFlagsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  let query = auth.admin
    .from("clip_flags")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: auth.user.id,
      resolution: parsed.data.resolution?.trim() || "dismissed (bulk review)",
    })
    .is("resolved_at", null);
  if (parsed.data.flag_ids?.length) {
    query = query.in("id", parsed.data.flag_ids);
  } else {
    query = query.in("clip_id", parsed.data.clip_ids!);
  }

  const { data, error } = await query.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, resolved: data?.length ?? 0 });
}
