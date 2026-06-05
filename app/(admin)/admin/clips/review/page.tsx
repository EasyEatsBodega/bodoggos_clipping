import Link from "next/link";
import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtRelative } from "@/lib/format";
import { AdminNav } from "@/components/admin/AdminNav";
import { BottingButton } from "@/components/admin/BottingButton";
import { fetchAllPages } from "@/lib/queries";
import {
  rollupByClipper,
  scoreClip,
  type ClipForScore,
  type ClipScore,
  type Snapshot,
} from "@/lib/bot-detect";

export const dynamic = "force-dynamic";

const LOOKBACK_DAYS = 30;
const TOP_CLIPS = 60;
const TOP_CLIPPERS = 25;

export default async function BotReviewPage() {
  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  // Pull the clips in scope (non-rejected, recently submitted or still
  // tracking) and every snapshot for them. Snapshots feed all the hourly
  // heuristics in lib/bot-detect.
  const [clips, snapshots, clippers] = await Promise.all([
    fetchAllPages<ClipForScore>((from, to) =>
      admin
        .from("clips")
        .select(
          "id, clipper_id, url, status, impressions, final_impressions, submitted_at, botting_suspected",
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
    fetchAllPages<{ id: string; x_handle: string }>((from, to) =>
      admin
        .from("clippers")
        .select("id, x_handle")
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const handleOf = new Map(clippers.map((c) => [c.id, c.x_handle]));

  // Group snapshots by clip once, then score each clip.
  const snapsByClip = new Map<string, Snapshot[]>();
  for (const s of snapshots) {
    const cur = snapsByClip.get(s.clip_id) ?? [];
    cur.push(s);
    snapsByClip.set(s.clip_id, cur);
  }
  const scoreByClip = new Map<string, ClipScore>();
  for (const c of clips) {
    scoreByClip.set(c.id, scoreClip(c, snapsByClip.get(c.id) ?? []));
  }

  const topClips = [...clips]
    .map((c) => ({ clip: c, score: scoreByClip.get(c.id)! }))
    .filter((x) => x.score.composite >= 0.4)
    .sort((a, b) => b.score.composite - a.score.composite)
    .slice(0, TOP_CLIPS);

  const topClippers = rollupByClipper(clips, scoreByClip)
    .filter((r) => r.suspectCount >= 2 || r.meanScore >= 0.5)
    .slice(0, TOP_CLIPPERS);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[
          { label: "ADMIN.OPS", href: "/admin" },
          { label: "CLIPS", href: "/admin/clips" },
          { label: "BOT REVIEW" },
        ]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-10">
        <section className="flex flex-col gap-2">
          <h2 className="label">automated bot-likeness review</h2>
          <p className="font-mono text-xs text-text-2 max-w-3xl">
            Surfaces clips and clippers whose impression patterns look like
            purchased traffic — single-hour view bursts, flat growth after a
            spike, suspiciously round totals. Last {LOOKBACK_DAYS} days,
            excluding already-rejected and already-marked-botting clips.
            Click <span className="text-admin">mark botting</span> to
            confirm; the detected reason is pre-filled.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="label">
            top suspect clippers ({topClippers.length})
          </h3>
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-3">
            ranked by # of suspect clips in window. same-hour pattern &gt; 60%
            across a clipper&apos;s clips is a strong &quot;person, not noise&quot; signal.
          </p>
          {topClippers.length === 0 ? (
            <p className="font-mono text-xs text-text-3">
              no clippers crossing the threshold — either you&apos;re clean or
              the threshold is too high.
            </p>
          ) : (
            <div className="border border-border">
              <Table>
                <THead>
                  <TH>handle</TH>
                  <TH>suspect / total</TH>
                  <TH>mean score</TH>
                  <TH>max score</TH>
                  <TH>same-hour pattern</TH>
                  <TH>impressions (window)</TH>
                  <TH />
                </THead>
                <TBody>
                  {topClippers.map((r) => (
                    <TR key={r.clipperId}>
                      <TD className="font-mono">
                        <Link
                          href={`/admin/clippers/${r.clipperId}` as never}
                          className="hover:underline"
                        >
                          @{handleOf.get(r.clipperId) ?? "—"}
                        </Link>
                      </TD>
                      <TD className="num text-admin">
                        {r.suspectCount} / {r.clipCount}
                      </TD>
                      <TD className="num">{(r.meanScore * 100).toFixed(0)}</TD>
                      <TD className="num">{(r.maxScore * 100).toFixed(0)}</TD>
                      <TD
                        className={`num ${r.sameHourPattern >= 0.6 ? "text-admin" : "text-text-2"}`}
                      >
                        {(r.sameHourPattern * 100).toFixed(0)}%
                      </TD>
                      <TD className="num">{fmtInt(r.totalImpressions)}</TD>
                      <TD>
                        <Link
                          href={
                            `/admin/clips?clipper=${r.clipperId}` as never
                          }
                          className="font-mono text-[10px] uppercase tracking-widest text-admin hover:underline"
                        >
                          their clips →
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="label">top suspect clips ({topClips.length})</h3>
          <p className="font-mono text-[10px] uppercase tracking-widest text-text-3">
            sub-scores: <span className="text-text-2">conc</span> = % of views in biggest hour;
            <span className="text-text-2"> spike</span> = biggest hour vs typical hour;
            <span className="text-text-2"> plat</span> = flatness after spike;
            <span className="text-text-2"> rnd</span> = trailing zeros.
          </p>
          {topClips.length === 0 ? (
            <p className="font-mono text-xs text-text-3">
              no clips crossing the threshold.
            </p>
          ) : (
            <div className="border border-border">
              <Table>
                <THead>
                  <TH>handle</TH>
                  <TH>tweet</TH>
                  <TH>impressions</TH>
                  <TH>score</TH>
                  <TH>conc</TH>
                  <TH>spike</TH>
                  <TH>plat</TH>
                  <TH>rnd</TH>
                  <TH>biggest hour</TH>
                  <TH>submitted</TH>
                  <TH />
                </THead>
                <TBody>
                  {topClips.map(({ clip, score }) => {
                    const impr = Number(
                      clip.final_impressions ?? clip.impressions ?? 0,
                    );
                    return (
                      <TR key={clip.id}>
                        <TD className="font-mono">
                          <Link
                            href={`/admin/clippers/${clip.clipper_id}` as never}
                            className="hover:underline"
                          >
                            @{handleOf.get(clip.clipper_id) ?? "—"}
                          </Link>
                        </TD>
                        <TD className="font-mono text-xs text-text-2 max-w-[220px] truncate">
                          <a
                            href={clip.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline"
                          >
                            {clip.url}
                          </a>
                        </TD>
                        <TD className="num">{fmtInt(impr)}</TD>
                        <TD className="num text-admin">
                          {(score.composite * 100).toFixed(0)}
                        </TD>
                        <TD className="num text-text-2">
                          {(score.concentration * 100).toFixed(0)}
                        </TD>
                        <TD className="num text-text-2">
                          {(score.spike * 100).toFixed(0)}
                        </TD>
                        <TD className="num text-text-2">
                          {(score.plateau * 100).toFixed(0)}
                        </TD>
                        <TD className="num text-text-2">
                          {(score.roundness * 100).toFixed(0)}
                        </TD>
                        <TD className="font-mono text-xs text-text-2">
                          {score.biggestHourAt
                            ? `${fmtInt(score.biggestHourDelta)} @ ${fmtRelative(score.biggestHourAt)}`
                            : "—"}
                        </TD>
                        <TD className="font-mono text-xs text-text-2">
                          {fmtRelative(clip.submitted_at)}
                        </TD>
                        <TD>
                          <BottingButton
                            clipId={clip.id}
                            suspected={false}
                            currentReason={score.reasonSummary}
                          />
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
