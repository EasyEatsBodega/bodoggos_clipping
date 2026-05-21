import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { submitClipSchema } from "@/lib/validators";
import { parseTweetUrl } from "@/lib/url-canonicalizer";
import { getXProvider } from "@/lib/x-provider";
import { getCampaignSpend, isCampaignOpen } from "@/lib/queries";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = submitClipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const { data: clipper, error: clipperErr } = await supabase
    .from("clippers")
    .select(
      "id, x_handle, banned, flat_fee_per_clip, cpm_rate_override, max_payout_override",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (clipperErr) {
    console.error("[clips] clipper lookup failed", clipperErr);
    return NextResponse.json(
      { error: `clipper lookup failed: ${clipperErr.message}` },
      { status: 500 },
    );
  }
  if (!clipper) return NextResponse.json({ error: "no clipper profile" }, { status: 403 });
  if (clipper.banned) return NextResponse.json({ error: "account suspended" }, { status: 403 });

  const parsedUrl = parseTweetUrl(parsed.data.url);
  if (!parsedUrl) {
    return NextResponse.json({ error: "invalid X / Twitter URL" }, { status: 400 });
  }

  // Duplicate check (use admin client to read across all clippers; tweet_id is globally unique)
  const admin = createSupabaseAdminClient();
  const dup = await admin
    .from("clips")
    .select("id")
    .eq("tweet_id", parsedUrl.tweetId)
    .maybeSingle();
  if (dup.data) {
    return NextResponse.json({ error: "this tweet has already been submitted" }, { status: 409 });
  }

  // Target campaign — must exist, be open, and clipper must be enrolled
  const { data: campaign, error: campaignErr } = await admin
    .from("campaigns")
    .select("*")
    .eq("id", parsed.data.campaign_id)
    .maybeSingle();
  if (campaignErr || !campaign) {
    return NextResponse.json({ error: "campaign not found" }, { status: 404 });
  }
  if (!isCampaignOpen(campaign)) {
    return NextResponse.json({ error: "this campaign is not currently accepting clips" }, { status: 400 });
  }

  const { data: enrollment } = await admin
    .from("campaign_enrollments")
    .select("clipper_id")
    .eq("clipper_id", user.id)
    .eq("campaign_id", campaign.id)
    .maybeSingle();
  if (!enrollment) {
    return NextResponse.json(
      { error: "you need to enroll in this campaign before submitting" },
      { status: 403 },
    );
  }

  // Budget cap — reject new submissions once total spend hits budget_usd
  if (campaign.budget_usd != null) {
    const spent = await getCampaignSpend(admin, campaign.id);
    if (spent >= Number(campaign.budget_usd)) {
      return NextResponse.json(
        { error: "this campaign's budget is fully allocated" },
        { status: 400 },
      );
    }
  }

  // Verify with X
  let lookup;
  try {
    lookup = await getXProvider().getTweet(parsedUrl.tweetId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[clips] X provider lookup failed", { tweetId: parsedUrl.tweetId, message });
    if (message.includes("TWITTERAPI_IO_KEY")) {
      return NextResponse.json(
        { error: "server misconfigured: X provider key missing" },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "X is temporarily unreachable, try again in a minute" },
      { status: 503 },
    );
  }

  if (lookup.deleted) {
    return NextResponse.json({ error: "this tweet is unavailable or deleted" }, { status: 400 });
  }
  const tweetAuthor = lookup.authorUsername.toLowerCase();
  const primaryHandle = clipper.x_handle.toLowerCase();
  let allowed = tweetAuthor === primaryHandle;
  if (!allowed) {
    const { data: altHandles } = await admin
      .from("clipper_alt_handles")
      .select("x_handle")
      .eq("clipper_id", user.id);
    allowed = (altHandles ?? []).some((h) => h.x_handle === tweetAuthor);
  }
  if (!allowed) {
    return NextResponse.json(
      {
        error: `this post is from @${lookup.authorUsername} but your linked handle is @${clipper.x_handle}`,
      },
      { status: 400 },
    );
  }

  const trackingUntil = new Date();
  trackingUntil.setUTCDate(trackingUntil.getUTCDate() + Number(campaign.tracking_days));

  const effectiveCpm = clipper.cpm_rate_override ?? campaign.cpm_rate;
  const effectiveMax = clipper.max_payout_override ?? campaign.max_payout_per_clip;
  const effectiveFlat = clipper.flat_fee_per_clip ?? 0;

  const { data: clip, error: insertErr } = await admin
    .from("clips")
    .insert({
      clipper_id: user.id,
      campaign_id: campaign.id,
      url: parsedUrl.canonical,
      tweet_id: parsedUrl.tweetId,
      tracking_until: trackingUntil.toISOString(),
      impressions: lookup.impressionCount ?? 0,
      cpm_rate_snapshot: effectiveCpm,
      max_payout_snapshot: effectiveMax,
      flat_fee_snapshot: effectiveFlat,
      min_views_snapshot: campaign.min_views ?? null,
      x_author_id: lookup.authorId || null,
    })
    .select()
    .single();

  if (insertErr || !clip) {
    return NextResponse.json({ error: insertErr?.message ?? "insert failed" }, { status: 500 });
  }

  await admin.from("clip_impression_snapshots").insert({
    clip_id: clip.id,
    impressions: lookup.impressionCount ?? 0,
    source: "twitterapi_io",
  });

  return NextResponse.json({ clip });
}
