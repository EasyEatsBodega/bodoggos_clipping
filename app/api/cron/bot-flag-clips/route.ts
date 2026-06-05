import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchAllPages } from "@/lib/queries";
import {
  scoreClip,
  type ClipForScore,
  type Snapshot,
} from "@/lib/bot-detect";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily auto-flag pass. Scores every active (non-rejected, non-already-marked-botting)
// clip from the last LOOKBACK_DAYS using the same heuristics shown on
// /admin/clips/review, and files a clip_flag for any clip above the
// confidence threshold that doesn't already have an open flag. Conservative
// threshold (0.6) so flags reaching the inbox are high-signal — admin still
// confirms before payouts are affected.
const LOOKBACK_DAYS = 30;
const SCORE_THRESHOLD = 0.6;

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  const [clips, snapshots, openFlags] = await Promise.all([
    fetchAllPages<ClipForScore>((from, to) =>
      admin
        .from("clips")
        .select(
          "id, clipper_id, url, status, impressions, final_impressions, submitted_at",
        )
        .neq("status", "rejected")
        .eq("botting_suspected", false)
        .gte("submitted_at", since)
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<Snapshot>((from, to) =>
      admin
        .from("clip_impression_snapshots")
        .select("clip_id, impressions, captured_at")
        .gte("captured_at", since)
        .order("captured_at", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{ clip_id: string }>((from, to) =>
      admin
        .from("clip_flags")
        .select("clip_id")
        .is("resolved_at", null)
        .order("clip_id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const alreadyFlagged = new Set(openFlags.map((f) => f.clip_id));
  const snapsByClip = new Map<string, Snapshot[]>();
  for (const s of snapshots) {
    const cur = snapsByClip.get(s.clip_id) ?? [];
    cur.push(s);
    snapsByClip.set(s.clip_id, cur);
  }

  type NewFlag = { clip_id: string; reason: string };
  const newFlags: NewFlag[] = [];
  for (const c of clips) {
    if (alreadyFlagged.has(c.id)) continue;
    const score = scoreClip(c, snapsByClip.get(c.id) ?? []);
    if (score.composite < SCORE_THRESHOLD) continue;
    // Prefix so the flag reason is recognizable as system-generated in
    // /admin/flags and on the clip detail page.
    newFlags.push({
      clip_id: c.id,
      reason: `[auto] bot-likeness ${Math.round(score.composite * 100)}: ${score.reasonSummary}`,
    });
  }

  let inserted = 0;
  if (newFlags.length > 0) {
    // flagged_by stays NULL — these aren't attributable to a human admin.
    const { error, count } = await admin
      .from("clip_flags")
      .insert(newFlags, { count: "exact" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    inserted = count ?? newFlags.length;
  }

  return NextResponse.json({
    scanned: clips.length,
    already_flagged: openFlags.length,
    new_flags: inserted,
    threshold: SCORE_THRESHOLD,
  });
}

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get("x-cron-secret") === secret;
}
