import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getXProvider } from "@/lib/x-provider";
import { shouldPoll } from "@/lib/poll-cadence";

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

  const { data: clips, error } = await admin
    .from("clips")
    .select("id, tweet_id, submitted_at, last_polled_at, poll_count, x_author_id")
    .eq("status", "tracking")
    .gt("tracking_until", new Date().toISOString())
    .order("submitted_at", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();
  let polled = 0;
  let skipped = 0;
  let failed = 0;
  let rejected = 0;

  for (const clip of clips ?? []) {
    const due = shouldPoll({
      submittedAt: new Date(clip.submitted_at),
      lastPolledAt: clip.last_polled_at ? new Date(clip.last_polled_at) : null,
      now,
    });
    if (!due) {
      skipped++;
      continue;
    }

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

      const impressions = lookup.impressionCount ?? 0;
      await admin
        .from("clips")
        .update({
          impressions,
          last_polled_at: now.toISOString(),
          poll_count: clip.poll_count + 1,
        })
        .eq("id", clip.id);
      await admin.from("clip_impression_snapshots").insert({
        clip_id: clip.id,
        impressions,
        source: process.env.X_PROVIDER === "x_official" ? "x_official" : "twitterapi_io",
      });
      polled++;
    } catch (err) {
      failed++;
      // continue; one bad clip shouldn't fail the whole batch
    }
  }

  return NextResponse.json({ polled, skipped, failed, rejected, total: clips?.length ?? 0 });
}

function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>; we also accept x-cron-secret for manual calls.
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.headers.get("x-cron-secret") === secret;
}
