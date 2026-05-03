import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: clippers }, { data: clips }, { data: payouts }] = await Promise.all([
    auth.admin.from("clippers").select("*").order("joined_at", { ascending: true }),
    auth.admin.from("clips").select("clipper_id, impressions, final_impressions, payout_amount"),
    auth.admin.from("payouts").select("clipper_id, amount"),
  ]);

  const stats = new Map<
    string,
    { clips: number; impressions: number; earnedCents: number; paidCents: number }
  >();
  for (const c of clips ?? []) {
    const cur = stats.get(c.clipper_id) ?? { clips: 0, impressions: 0, earnedCents: 0, paidCents: 0 };
    cur.clips++;
    cur.impressions += Number(c.final_impressions ?? c.impressions ?? 0);
    cur.earnedCents += Math.round(Number(c.payout_amount ?? 0) * 100);
    stats.set(c.clipper_id, cur);
  }
  for (const p of payouts ?? []) {
    const cur = stats.get(p.clipper_id) ?? { clips: 0, impressions: 0, earnedCents: 0, paidCents: 0 };
    cur.paidCents += Math.round(Number(p.amount ?? 0) * 100);
    stats.set(p.clipper_id, cur);
  }

  const rows = (clippers ?? []).map((c) => {
    const s = stats.get(c.id) ?? { clips: 0, impressions: 0, earnedCents: 0, paidCents: 0 };
    const out = Math.max(0, s.earnedCents - s.paidCents);
    return {
      email: c.email,
      x_handle: c.x_handle,
      joined_at: c.joined_at,
      total_clips: s.clips,
      total_impressions: s.impressions,
      total_earned: (s.earnedCents / 100).toFixed(2),
      total_paid: (s.paidCents / 100).toFixed(2),
      outstanding: (out / 100).toFixed(2),
    };
  });

  const csv = toCsv(rows, [
    "email",
    "x_handle",
    "joined_at",
    "total_clips",
    "total_impressions",
    "total_earned",
    "total_paid",
    "outstanding",
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
