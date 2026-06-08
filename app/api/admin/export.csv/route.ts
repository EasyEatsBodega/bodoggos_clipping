import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { toCsv } from "@/lib/csv";
import { fetchAllPages } from "@/lib/queries";

// Full clipper roster for outreach / messaging. One row per clipper with the
// X handle + a ready-to-click profile URL, plus the existing money columns and
// bot-flag counts so the user can sort the CSV by who needs attention.
//
// Paged so an Excel export reflects every clipper / clip / payout / flag — the
// underlying tables would otherwise truncate at the Postgrest 1000-row cap.
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [clippers, clips, payouts, openFlags] = await Promise.all([
    fetchAllPages<{
      id: string;
      email: string;
      x_handle: string;
      joined_at: string;
      banned: boolean;
      solana_wallet: string | null;
    }>((from, to) =>
      auth.admin
        .from("clippers")
        .select("id, email, x_handle, joined_at, banned, solana_wallet")
        .order("joined_at", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{
      id: string;
      clipper_id: string;
      impressions: number | null;
      final_impressions: number | null;
      payout_amount: string | null;
      botting_suspected: boolean | null;
      status: "tracking" | "completed" | "rejected";
    }>((from, to) =>
      auth.admin
        .from("clips")
        .select(
          "id, clipper_id, impressions, final_impressions, payout_amount, botting_suspected, status",
        )
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{ clipper_id: string; amount: string }>((from, to) =>
      auth.admin
        .from("payouts")
        .select("clipper_id, amount")
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{ clip_id: string }>((from, to) =>
      auth.admin
        .from("clip_flags")
        .select("clip_id")
        .is("resolved_at", null)
        .order("clip_id", { ascending: true })
        .range(from, to),
    ),
  ]);

  // Map clip_id -> clipper_id so we can attribute flag counts to clippers.
  const clipperOfClip = new Map<string, string>();
  for (const c of clips) clipperOfClip.set(c.id, c.clipper_id);
  const openFlagsByClipper = new Map<string, number>();
  for (const f of openFlags) {
    const clipperId = clipperOfClip.get(f.clip_id);
    if (!clipperId) continue;
    openFlagsByClipper.set(clipperId, (openFlagsByClipper.get(clipperId) ?? 0) + 1);
  }

  type Stats = {
    clips: number;
    activeClips: number;
    impressions: number;
    earnedCents: number;
    paidCents: number;
    bottedClips: number;
  };
  const empty = (): Stats => ({
    clips: 0,
    activeClips: 0,
    impressions: 0,
    earnedCents: 0,
    paidCents: 0,
    bottedClips: 0,
  });

  const stats = new Map<string, Stats>();
  for (const c of clips) {
    const cur = stats.get(c.clipper_id) ?? empty();
    cur.clips++;
    if (c.status !== "rejected") cur.activeClips++;
    cur.impressions += Number(c.final_impressions ?? c.impressions ?? 0);
    cur.earnedCents += Math.round(Number(c.payout_amount ?? 0) * 100);
    if (c.botting_suspected) cur.bottedClips++;
    stats.set(c.clipper_id, cur);
  }
  for (const p of payouts) {
    const cur = stats.get(p.clipper_id) ?? empty();
    cur.paidCents += Math.round(Number(p.amount ?? 0) * 100);
    stats.set(p.clipper_id, cur);
  }

  const rows = clippers.map((c) => {
    const s = stats.get(c.id) ?? empty();
    const out = Math.max(0, s.earnedCents - s.paidCents);
    const openFlagCount = openFlagsByClipper.get(c.id) ?? 0;
    return {
      handle: `@${c.x_handle}`,
      x_profile_url: `https://x.com/${c.x_handle}`,
      email: c.email,
      joined_at: c.joined_at,
      banned: c.banned ? "yes" : "",
      solana_wallet: c.solana_wallet ?? "",
      total_clips: s.clips,
      active_clips: s.activeClips,
      total_impressions: s.impressions,
      total_earned: (s.earnedCents / 100).toFixed(2),
      total_paid: (s.paidCents / 100).toFixed(2),
      outstanding: (out / 100).toFixed(2),
      botted_clips: s.bottedClips,
      open_flags: openFlagCount,
    };
  });

  const csv = toCsv(rows, [
    "handle",
    "x_profile_url",
    "email",
    "joined_at",
    "banned",
    "solana_wallet",
    "total_clips",
    "active_clips",
    "total_impressions",
    "total_earned",
    "total_paid",
    "outstanding",
    "botted_clips",
    "open_flags",
  ]);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="clippers-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
