import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { StatCell } from "@/components/ui/StatCell";
import { THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtRelative } from "@/lib/format";
import { AdminNav } from "@/components/admin/AdminNav";
import { PrintButton } from "./PrintButton";
import { fetchAllPages } from "@/lib/queries";
import { scoreClip, type ClipForScore, type Snapshot } from "@/lib/bot-detect";

export const dynamic = "force-dynamic";

// Shareable per-clipper "suspected engagement farming" report. Lists each
// clip we've flagged for botting plus the data signals that flagged them,
// so the clipper sees concrete evidence (concentration %, spike ratio,
// post-spike flatness) instead of a bare assertion. Designed to be
// printed/screenshotted and sent back to the clipper.
export default async function ClipperBotReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const { data: clipper } = await admin
    .from("clippers")
    .select("id, x_handle, email")
    .eq("id", id)
    .maybeSingle();
  if (!clipper) notFound();

  const { data: flaggedClips } = await admin
    .from("clips")
    .select(
      "id, clipper_id, url, impressions, final_impressions, status, submitted_at, botting_reason, botting_marked_at",
    )
    .eq("clipper_id", id)
    .eq("botting_suspected", true)
    .order("botting_marked_at", { ascending: false });

  const clips = (flaggedClips ?? []) as Array<
    ClipForScore & { botting_reason: string | null; botting_marked_at: string | null }
  >;

  // Pull snapshots for these clips so we can re-derive the same heuristics
  // shown on /admin/clips/review. We're scoring whatever the admin already
  // flagged, so the score corroborates the call rather than re-litigating it.
  const clipIds = clips.map((c) => c.id);
  let snapshots: Snapshot[] = [];
  if (clipIds.length > 0) {
    snapshots = await fetchAllPages<Snapshot>((from, to) =>
      admin
        .from("clip_impression_snapshots")
        .select("clip_id, impressions, captured_at")
        .in("clip_id", clipIds)
        .order("captured_at", { ascending: true })
        .range(from, to),
    );
  }
  const snapsByClip = new Map<string, Snapshot[]>();
  for (const s of snapshots) {
    const cur = snapsByClip.get(s.clip_id) ?? [];
    cur.push(s);
    snapsByClip.set(s.clip_id, cur);
  }
  const scored = clips.map((c) => ({
    clip: c,
    score: scoreClip(c, snapsByClip.get(c.id) ?? []),
  }));

  const totalImpressions = clips.reduce(
    (s, c) => s + Number(c.final_impressions ?? c.impressions ?? 0),
    0,
  );

  // Clipper-level signature: mean concentration, # of single-hour bursts,
  // same-hour-of-day pattern across the flagged clips.
  const hourCounts = new Map<number, number>();
  let bursts = 0;
  let concentrationSum = 0;
  for (const { score } of scored) {
    concentrationSum += score.concentration;
    if (score.concentration >= 0.5) bursts++;
    if (score.biggestHourAt) {
      const h = new Date(score.biggestHourAt).getUTCHours();
      hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
    }
  }
  const meanConcentration = scored.length ? concentrationSum / scored.length : 0;
  const topHourCount = Math.max(0, ...hourCounts.values());
  const sameHourPct = scored.length ? topHourCount / scored.length : 0;
  let modeHour: number | null = null;
  let modeHourCount = 0;
  for (const [h, n] of hourCounts) {
    if (n > modeHourCount) {
      modeHour = h;
      modeHourCount = n;
    }
  }

  const generatedAt = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="print:hidden">
        <Header
          crumbs={[
            { label: "ADMIN.OPS", href: "/admin" },
            { label: "CLIPPERS", href: "/admin/clippers" },
            { label: `@${clipper.x_handle}`, href: `/admin/clippers/${clipper.id}` },
            { label: "BOT REPORT" },
          ]}
          accent="admin"
          showLogout
        />
        <AdminNav />
      </div>

      <main className="flex-1 max-w-[1100px] mx-auto px-6 py-10 w-full flex flex-col gap-8">
        <div className="flex flex-wrap items-start justify-between gap-4 print:flex-col">
          <div>
            <p className="label text-admin">suspected engagement farming report</p>
            <h1 className="font-serif text-4xl mt-2">@{clipper.x_handle}</h1>
            <p className="font-mono text-xs text-text-2 mt-2">{clipper.email}</p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-text-3 mt-2">
              generated {generatedAt}
            </p>
          </div>
          <div className="flex items-center gap-3 print:hidden">
            <Link
              href={`/admin/clippers/${clipper.id}` as never}
              className="font-mono text-[10px] uppercase tracking-widest text-text-2 hover:text-text"
            >
              ← back to clipper
            </Link>
            <PrintButton />
          </div>
        </div>

        <div className="border border-border p-4 bg-surface text-sm font-mono text-text-2 leading-relaxed print:text-xs print:p-3">
          The clips listed below have been flagged for suspected engagement
          farming / bot-driven views. They remain in the system and continue
          to count toward overall campaign metrics, but{" "}
          <span className="text-danger">are not paid out</span> to the
          clipper while the flag is in place.
        </div>

        <div className="bg-border grid grid-cols-1 md:grid-cols-3 gap-px">
          <StatCell label="flagged clips" value={fmtInt(clips.length)} accent="admin" />
          <StatCell
            label="excluded impressions"
            value={fmtInt(totalImpressions)}
            accent="admin"
          />
          <StatCell label="payouts withheld" value="excluded" hint="not counted toward USDC payouts" />
        </div>

        {scored.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="label">detected pattern signature</h2>
            <div className="bg-border grid grid-cols-2 md:grid-cols-4 gap-px">
              <StatCell
                label="single-hour bursts"
                value={`${bursts} / ${scored.length}`}
                hint=">50% of a clip's views in one hour"
                accent="admin"
              />
              <StatCell
                label="avg concentration"
                value={`${(meanConcentration * 100).toFixed(0)}%`}
                hint="share of views in biggest hour"
              />
              <StatCell
                label="same-hour pattern"
                value={`${(sameHourPct * 100).toFixed(0)}%`}
                hint={
                  modeHour !== null && modeHourCount >= 2
                    ? `${modeHourCount} clips spike around ${String(modeHour).padStart(2, "0")}:00 UTC`
                    : "share sharing the same UTC hour"
                }
                accent={sameHourPct >= 0.6 ? "admin" : undefined}
              />
              <StatCell
                label="signals tripped"
                value={scored
                  .reduce((s, x) => s + Math.round(x.score.composite * 100), 0)
                  .toString()}
                hint="cumulative bot-likeness score"
              />
            </div>
            <div className="border border-border p-4 bg-surface text-xs font-mono text-text-2 leading-relaxed print:text-[11px]">
              <p className="mb-2 text-text">// how this is measured</p>
              <p>
                Every clip&apos;s impression count is sampled hourly by the
                campaign system. For each clip we compute four signals from
                that time series:
              </p>
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li>
                  <span className="text-text">concentration</span> — the
                  share of total views delivered in the single biggest hour.
                  Organic clips spread; purchased traffic concentrates.
                </li>
                <li>
                  <span className="text-text">spike</span> — the biggest
                  hour&apos;s growth compared to the clip&apos;s typical
                  hour.
                </li>
                <li>
                  <span className="text-text">plateau</span> — how flat
                  growth becomes immediately after the biggest hour. Bot
                  deliveries spike then dry up.
                </li>
                <li>
                  <span className="text-text">roundness</span> — trailing
                  zeros on the final view count, common for paid-traffic
                  delivery packages.
                </li>
              </ul>
              {sameHourPct >= 0.6 && modeHour !== null && (
                <p className="mt-3 text-admin">
                  Additional pattern detected: {modeHourCount} of your{" "}
                  {scored.length} flagged clips spike at the same UTC hour
                  ({String(modeHour).padStart(2, "0")}:00). Independent
                  organic growth does not cluster on the same wall-clock
                  hour across multiple posts.
                </p>
              )}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="label">flagged clips</h2>
          <div className="border border-border overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <THead>
                <TH>#</TH>
                <TH>clip</TH>
                <TH className="text-right">impressions</TH>
                <TH className="text-right">biggest-hour share</TH>
                <TH className="text-right">spike vs typical</TH>
                <TH>signal</TH>
                <TH>submitted</TH>
              </THead>
              <TBody>
                {scored.map(({ clip, score }, i) => {
                  const impr = Number(clip.final_impressions ?? clip.impressions ?? 0);
                  const concPct = (score.concentration * 100).toFixed(0);
                  const spikeMult =
                    score.medianHourDelta > 0
                      ? Math.round(score.biggestHourDelta / score.medianHourDelta)
                      : null;
                  return (
                    <TR key={clip.id}>
                      <TD className="font-mono text-text-3">{i + 1}</TD>
                      <TD className="font-mono text-xs">
                        <a
                          href={clip.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-accent break-all print:text-blue-700 print:underline"
                        >
                          {shortenTweetUrl(clip.url)} ↗
                        </a>
                      </TD>
                      <TD className="num text-right">{fmtInt(impr)}</TD>
                      <TD
                        className={`num text-right ${score.concentration >= 0.5 ? "text-admin" : "text-text-2"}`}
                      >
                        {concPct}%
                      </TD>
                      <TD className="num text-right text-text-2">
                        {spikeMult != null ? `${spikeMult}×` : "—"}
                      </TD>
                      <TD className="font-mono text-[10px] text-text-2 max-w-[300px]">
                        {score.reasonSummary}
                      </TD>
                      <TD className="font-mono text-xs text-text-2">
                        {fmtRelative(clip.submitted_at)}
                      </TD>
                    </TR>
                  );
                })}
                {scored.length === 0 && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm">
                      no clips marked as suspected engagement farming for
                      this clipper.
                    </TD>
                    <TD /><TD /><TD /><TD /><TD /><TD />
                  </TR>
                )}
              </TBody>
            </table>
          </div>
        </section>

        <p className="font-mono text-[10px] text-text-3 print:mt-12">
          // questions or want a clip reviewed? reply to this report and an
          admin will take a second look.
        </p>
      </main>
    </div>
  );
}

// Tweets look like https://x.com/<handle>/status/<tweet_id>. The full
// URL eats too much horizontal space in the printed table — show
// "@<handle> · 12345…" instead so the column stays narrow.
function shortenTweetUrl(url: string): string {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (m) {
      const handle = m[1];
      const id = m[2];
      const tail = id.length > 6 ? `${id.slice(0, 4)}…${id.slice(-3)}` : id;
      return `@${handle} · ${tail}`;
    }
    return u.host + u.pathname;
  } catch {
    return url;
  }
}
