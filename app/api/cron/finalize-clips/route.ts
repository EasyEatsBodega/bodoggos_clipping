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
    .select(
      "id, tweet_id, impressions, poll_count, cpm_rate_snapshot, max_payout_snapshot, flat_fee_snapshot, min_views_snapshot, botting_suspected, missing_poll_count",
    )
    .eq("status", "tracking")
    .lte("tracking_until", now.toISOString())
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let finalized = 0;
  let rejected = 0;

  // Mirror poll-clips: require sustained missing signals before rejecting,
  // so a transient blip at finalize time doesn't unfairly cost a clipper
  // their earned payout.
  const MISSING_THRESHOLD = 3;

  for (const clip of clips ?? []) {
    let impressions = clip.impressions;
    let missingCount = clip.missing_poll_count ?? 0;

    try {
      const lookup = await provider.getTweet(clip.tweet_id);
      if (lookup.deleted) {
        const nextMissing = missingCount + 1;
        if (nextMissing >= MISSING_THRESHOLD) {
          await admin
            .from("clips")
            .update({
              status: "rejected",
              rejected_reason: "tweet_deleted",
              last_polled_at: now.toISOString(),
              poll_count: clip.poll_count + 1,
              missing_poll_count: nextMissing,
            })
            .eq("id", clip.id);
          rejected++;
          continue;
        }
        // Not enough confirmations — finalize with last known impressions
        // so the clipper still gets paid for confirmed views.
        missingCount = nextMissing;
      } else if (lookup.impressionCount != null) {
        impressions = lookup.impressionCount;
        missingCount = 0;
        await admin.from("clip_impression_snapshots").insert({
          clip_id: clip.id,
          impressions,
          source: process.env.X_PROVIDER === "x_official" ? "x_official" : "twitterapi_io",
        });
      }
    } catch {
      // fall through with last known impressions
    }

    const payoutAmount = clip.botting_suspected
      ? "0.00"
      : computePayoutAmount(
          impressions,
          clip.cpm_rate_snapshot,
          clip.max_payout_snapshot,
          clip.flat_fee_snapshot ?? 0,
          clip.min_views_snapshot ?? 0,
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
        missing_poll_count: missingCount,
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
