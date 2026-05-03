import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getXProvider } from "@/lib/x-provider";
import { computePayoutAmount } from "@/lib/payout-calc";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const provider = getXProvider();

  const now = new Date();
  const { data: clips, error } = await admin
    .from("clips")
    .select("id, tweet_id, impressions, poll_count, cpm_rate_snapshot, max_payout_snapshot")
    .eq("status", "tracking")
    .lte("tracking_until", now.toISOString())
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let finalized = 0;
  let rejected = 0;

  for (const clip of clips ?? []) {
    let impressions = clip.impressions;

    try {
      const lookup = await provider.getTweet(clip.tweet_id);
      if (lookup.deleted) {
        await admin
          .from("clips")
          .update({
            status: "rejected",
            rejected_reason: "tweet_deleted",
            last_polled_at: now.toISOString(),
            poll_count: clip.poll_count + 1,
          })
          .eq("id", clip.id);
        rejected++;
        continue;
      }
      if (lookup.impressionCount != null) {
        impressions = lookup.impressionCount;
        await admin.from("clip_impression_snapshots").insert({
          clip_id: clip.id,
          impressions,
          source: process.env.X_PROVIDER === "x_official" ? "x_official" : "twitterapi_io",
        });
      }
    } catch {
      // fall through with last known impressions
    }

    const payoutAmount = computePayoutAmount(
      impressions,
      clip.cpm_rate_snapshot,
      clip.max_payout_snapshot,
    );

    await admin
      .from("clips")
      .update({
        status: "completed",
        final_impressions: impressions,
        impressions,
        payout_amount: payoutAmount,
        last_polled_at: now.toISOString(),
        poll_count: clip.poll_count + 1,
      })
      .eq("id", clip.id);
    finalized++;
  }

  return NextResponse.json({ finalized, rejected, total: clips?.length ?? 0 });
}

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get("x-cron-secret") === secret;
}
