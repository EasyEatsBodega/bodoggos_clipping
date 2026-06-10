import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { fetchAllPages } from "@/lib/queries";

// POST: clear a clipper from the bot review queue. Marks every one of their
// current non-rejected, non-botting clips as reviewed/not-botting: resolves
// any open flags and inserts a pre-resolved flag for clips with no flag
// history (clips that only surfaced on /admin/clips/review via their score).
// Clips the clipper submits AFTER this still get scored and can re-surface
// the clipper — this clears the current batch, it's not a permanent pass.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;

  const { data: clipper } = await auth.admin
    .from("clippers")
    .select("id, x_handle")
    .eq("id", id)
    .maybeSingle();
  if (!clipper) return NextResponse.json({ error: "clipper not found" }, { status: 404 });

  const clips = await fetchAllPages<{ id: string }>((from, to) =>
    auth.admin
      .from("clips")
      .select("id")
      .eq("clipper_id", id)
      .neq("status", "rejected")
      .eq("botting_suspected", false)
      .order("id", { ascending: true })
      .range(from, to),
  );
  const clipIds = clips.map((c) => c.id);
  if (clipIds.length === 0) {
    return NextResponse.json({ ok: true, flags_resolved: 0, records_added: 0 });
  }

  const now = new Date().toISOString();
  const resolution = "reviewed — not botting (clipper cleared)";

  // .in() lists ride in the URL, so chunk to stay under Postgrest's
  // query-length limit.
  const CHUNK = 100;
  let flagsResolved = 0;
  const hasFlag = new Set<string>();
  for (let i = 0; i < clipIds.length; i += CHUNK) {
    const chunk = clipIds.slice(i, i + CHUNK);

    const { data: resolved, error: resolveErr } = await auth.admin
      .from("clip_flags")
      .update({ resolved_at: now, resolved_by: auth.user.id, resolution })
      .in("clip_id", chunk)
      .is("resolved_at", null)
      .select("clip_id");
    if (resolveErr) {
      return NextResponse.json({ error: resolveErr.message }, { status: 500 });
    }
    flagsResolved += resolved?.length ?? 0;

    const { data: existing, error: existingErr } = await auth.admin
      .from("clip_flags")
      .select("clip_id")
      .in("clip_id", chunk);
    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }
    for (const f of existing ?? []) hasFlag.add(f.clip_id);
  }

  // Pre-resolved review records for clips that never had a flag, so the
  // review page and bot-flag cron treat them as human-reviewed.
  const toInsert = clipIds
    .filter((clipId) => !hasFlag.has(clipId))
    .map((clipId) => ({
      clip_id: clipId,
      reason: "[review] clipper cleared from bot review",
      flagged_by: auth.user.id,
      resolved_at: now,
      resolved_by: auth.user.id,
      resolution,
    }));
  let recordsAdded = 0;
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const { error: insertErr } = await auth.admin.from("clip_flags").insert(batch);
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    recordsAdded += batch.length;
  }

  return NextResponse.json({
    ok: true,
    clips: clipIds.length,
    flags_resolved: flagsResolved,
    records_added: recordsAdded,
  });
}
