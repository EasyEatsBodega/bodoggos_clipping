import { Header } from "@/components/Header";
import { StatCell } from "@/components/ui/StatCell";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt } from "@/lib/format";
import { AdminNav } from "@/components/admin/AdminNav";
import { OverviewCharts } from "@/components/admin/OverviewCharts";
import {
  bucketCount,
  cumulativeAverage,
  cumulativeImpressions,
  type Granularity,
} from "@/lib/chart-data";
import { fetchAllPages } from "@/lib/queries";

export const dynamic = "force-dynamic";

type DateRange = "24h" | "7d" | "30d" | "90d" | "all";
const VALID_RANGES: DateRange[] = ["24h", "7d", "30d", "90d", "all"];
type StatusFilter = "tracking" | "completed" | "rejected";
const VALID_STATUS: StatusFilter[] = ["tracking", "completed", "rejected"];

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    creator?: string;
    topic?: string;
    status?: string;
    campaign?: string;
    partner?: string;
  }>;
}) {
  const sp = await searchParams;
  const range = (VALID_RANGES as string[]).includes(sp.range ?? "")
    ? (sp.range as DateRange)
    : ("30d" as DateRange);
  const creatorSlug = (sp.creator ?? "").trim() || undefined;
  const topicSlug = (sp.topic ?? "").trim() || undefined;
  const campaignSlug = (sp.campaign ?? "").trim() || undefined;
  const partnerSlug = (sp.partner ?? "").trim() || undefined;
  const statusFilter = (VALID_STATUS as string[]).includes(sp.status ?? "")
    ? (sp.status as StatusFilter)
    : undefined;

  const admin = createSupabaseAdminClient();

  // Resolve the date window. "all" uses the earliest activity we can
  // find so the x-axis still has a sensible left edge.
  const now = new Date();
  let start: Date;
  if (range === "24h") start = hoursAgo(now, 24);
  else if (range === "7d") start = daysAgo(now, 7);
  else if (range === "30d") start = daysAgo(now, 30);
  else if (range === "90d") start = daysAgo(now, 90);
  else start = daysAgo(now, 365);

  // Short ranges resolve hourly so the curves move with each poll cycle;
  // longer ranges stay daily to keep the point count sane.
  const granularity: Granularity = range === "24h" || range === "7d" ? "hour" : "day";

  // Load tags + campaigns first so we can resolve filters to ids.
  const [{ data: tags }, { data: campaigns }] = await Promise.all([
    admin.from("clip_tags").select("id, slug, label, kind, sort_order"),
    admin
      .from("campaigns")
      .select("id, slug, name")
      .order("created_at", { ascending: false }),
  ]);
  const tagBySlug = new Map((tags ?? []).map((t) => [t.slug, t]));
  const creatorTag = creatorSlug ? tagBySlug.get(creatorSlug) ?? null : null;
  const topicTag = topicSlug ? tagBySlug.get(topicSlug) ?? null : null;
  const partnerTag = partnerSlug ? tagBySlug.get(partnerSlug) ?? null : null;
  const campaign = campaignSlug
    ? (campaigns ?? []).find((c) => c.slug === campaignSlug) ?? null
    : null;
  const filterTagIds = [creatorTag?.id, topicTag?.id, partnerTag?.id].filter(
    (x): x is string => !!x,
  );

  // Resolve the set of clip_ids that satisfy the (optional) tag filter.
  // If both creator and topic are set, require *both* (AND semantics).
  // Paged: a single popular tag can easily have >1000 assignments, and a
  // truncated lookup would silently hide most matching clips.
  let allowedClipIds: Set<string> | null = null;
  if (filterTagIds.length > 0) {
    const assigns = await fetchAllPages<{ clip_id: string; tag_id: string }>(
      (from, to) =>
        admin
          .from("clip_tag_assignments")
          .select("clip_id, tag_id")
          .in("tag_id", filterTagIds)
          .order("clip_id", { ascending: true })
          .range(from, to),
    );
    const countByClip = new Map<string, number>();
    for (const a of assigns) {
      countByClip.set(a.clip_id, (countByClip.get(a.clip_id) ?? 0) + 1);
    }
    allowedClipIds = new Set();
    for (const [clipId, count] of countByClip) {
      if (count >= filterTagIds.length) allowedClipIds.add(clipId);
    }
  }

  // Pull data within the window. Each of these queries used to be
  // single-shot (capped at 1000 by Postgrest); now paged so the overview
  // reflects every row. We deliberately don't pass `.in("id", allowedClipIds)`
  // to the clips query — a few thousand UUIDs in the URL exceeds Postgrest's
  // query length and the request silently fails. Instead we fetch all
  // in-window clips and filter by allowedClipIds in memory.
  type ClipRecord = {
    id: string;
    clipper_id: string;
    url: string;
    impressions: number | null;
    final_impressions: number | null;
    payout_amount: string | null;
    status: "tracking" | "completed" | "rejected";
    submitted_at: string;
    cpm_rate_snapshot: string;
    max_payout_snapshot: string;
    flat_fee_snapshot: string | null;
    min_views_snapshot: number | null;
    botting_suspected: boolean | null;
    campaign_id: string | null;
  };
  const [clipsRaw, clippersList, snapshots] = await Promise.all([
    fetchAllPages<ClipRecord>((from, to) => {
      let q = admin
        .from("clips")
        .select(
          "id, clipper_id, url, impressions, final_impressions, payout_amount, status, submitted_at, cpm_rate_snapshot, max_payout_snapshot, flat_fee_snapshot, min_views_snapshot, botting_suspected, campaign_id",
        )
        .order("submitted_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (statusFilter) q = q.eq("status", statusFilter);
      if (campaignSlug) {
        q = q.eq(
          "campaign_id",
          campaign?.id ?? "00000000-0000-0000-0000-000000000000",
        );
      }
      if (range !== "all") {
        q = q.gte("submitted_at", start.toISOString());
      }
      return q;
    }),
    fetchAllPages<{ id: string; x_handle: string; banned: boolean; joined_at: string }>(
      (from, to) =>
        admin
          .from("clippers")
          .select("id, x_handle, banned, joined_at")
          .order("id", { ascending: true })
          .range(from, to),
    ),
    fetchWindowSnapshots(admin, start.toISOString()),
  ]);

  // Apply tag filter in memory — see comment above for why we can't do this
  // in the SQL `in()`.
  const clips: ClipRecord[] = allowedClipIds
    ? clipsRaw.filter((c) => allowedClipIds!.has(c.id))
    : clipsRaw;
  const clippers = clippersList;

  // For impressions-over-time we restrict snapshots to clips that match the
  // current filter, otherwise the chart double-counts impressions from clips
  // that don't belong to the filter.
  const filteredClipIds = new Set(clips.map((c) => c.id));
  const filteredSnapshots = (snapshots ?? []).filter((s) =>
    filteredClipIds.has(s.clip_id),
  );

  // KPIs over the filtered clip set (regardless of submitted_at window
  // — KPIs represent the cumulative state of the matching clips).
  const totalImpressions =
    clips?.reduce(
      (s, c) => s + Number(c.final_impressions ?? c.impressions ?? 0),
      0,
    ) ?? 0;
  // Active clippers represented in the current filter/range: distinct,
  // non-banned clippers who have at least one clip in the filtered set.
  const bannedIds = new Set((clippers ?? []).filter((c) => c.banned).map((c) => c.id));
  const activeClipperIds = new Set<string>();
  for (const c of clips ?? []) {
    if (!bannedIds.has(c.clipper_id)) activeClipperIds.add(c.clipper_id);
  }
  const activeClippers = activeClipperIds.size;
  const trackingCount = clips?.filter((c) => c.status === "tracking").length ?? 0;
  const clipCount = clips?.length ?? 0;
  const avgImpressionsPerClip = clipCount > 0 ? Math.round(totalImpressions / clipCount) : 0;

  // Chart series.
  const clipsSubmittedSeries = bucketCount(
    (clips ?? []).filter(
      (c) =>
        c.submitted_at &&
        new Date(c.submitted_at).getTime() >= start.getTime(),
    ),
    (c) => c.submitted_at,
    start,
    now,
    granularity,
  );
  const newClippersSeries = bucketCount(
    (clippers ?? []).filter(
      (c) => c.joined_at && new Date(c.joined_at).getTime() >= start.getTime(),
    ),
    (c) => c.joined_at,
    start,
    now,
    granularity,
  );
  const impressionsSeries = cumulativeImpressions(
    filteredSnapshots,
    start,
    now,
    granularity,
    totalImpressions,
  );
  // Running avg impressions per clip: cumulative impressions / cumulative clips
  // submitted so far. The final point matches the avg/clip KPI above.
  const avgPerClipSeries = cumulativeAverage(
    impressionsSeries,
    clips ?? [],
    (c) => c.submitted_at,
    granularity,
  );

  // Leaderboards (impressions-ranked; money lives on the payouts page).
  const byClipper = new Map<string, { impressions: number }>();
  for (const c of clips ?? []) {
    const cur = byClipper.get(c.clipper_id) ?? { impressions: 0 };
    cur.impressions += Number(c.final_impressions ?? c.impressions ?? 0);
    byClipper.set(c.clipper_id, cur);
  }
  const handles = new Map(clippers?.map((c) => [c.id, c.x_handle]) ?? []);
  const topClippers = Array.from(byClipper.entries())
    .map(([id, v]) => ({ id, handle: handles.get(id) ?? "—", ...v }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  const topClips = (clips ?? [])
    .map((c) => ({
      id: c.id,
      url: c.url,
      clipperId: c.clipper_id,
      handle: handles.get(c.clipper_id) ?? "—",
      impressions: Number(c.final_impressions ?? c.impressions ?? 0),
      status: c.status as string,
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  const creatorTags = (tags ?? []).filter((t) => t.kind === "creator");
  const topicTags = (tags ?? []).filter((t) => t.kind === "topic");
  const partnerTags = (tags ?? []).filter((t) => t.kind === "partner");

  const baseParams = {
    range,
    creator: creatorSlug,
    topic: topicSlug,
    status: statusFilter,
    campaign: campaignSlug,
    partner: partnerSlug,
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "OVERVIEW" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-8">
        {/* Filter bar */}
        <div className="flex flex-col gap-3">
          <FilterRow
            label="range"
            base={baseParams}
            param="range"
            value={range}
            options={[
              { value: "24h", label: "24h" },
              { value: "7d", label: "7d" },
              { value: "30d", label: "30d" },
              { value: "90d", label: "90d" },
              { value: "all", label: "all" },
            ]}
            defaultValue="30d"
            allowClear={false}
          />
          {creatorTags.length > 0 && (
            <FilterRow
              label="creator"
              base={baseParams}
              param="creator"
              value={creatorSlug}
              options={creatorTags.map((t) => ({ value: t.slug, label: t.label }))}
              allowClear
            />
          )}
          {topicTags.length > 0 && (
            <FilterRow
              label="topic"
              base={baseParams}
              param="topic"
              value={topicSlug}
              options={topicTags.map((t) => ({ value: t.slug, label: t.label }))}
              allowClear
            />
          )}
          {(campaigns ?? []).length > 0 && (
            <FilterRow
              label="campaign"
              base={baseParams}
              param="campaign"
              value={campaignSlug}
              options={(campaigns ?? []).map((c) => ({ value: c.slug, label: c.name }))}
              allowClear
            />
          )}
          {partnerTags.length > 0 && (
            <FilterRow
              label="partner"
              base={baseParams}
              param="partner"
              value={partnerSlug}
              options={partnerTags.map((t) => ({ value: t.slug, label: t.label }))}
              allowClear
            />
          )}
          <FilterRow
            label="status"
            base={baseParams}
            param="status"
            value={statusFilter}
            options={[
              { value: "tracking", label: "tracking" },
              { value: "completed", label: "completed" },
              { value: "rejected", label: "rejected" },
            ]}
            allowClear
          />
        </div>

        <div className="bg-border grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-px">
          <StatCell label="impressions" value={fmtInt(totalImpressions)} accent="admin" />
          <StatCell label="avg / clip" value={fmtInt(avgImpressionsPerClip)} />
          <StatCell label="clips (filter)" value={fmtInt(clipCount)} />
          <StatCell label="tracking" value={fmtInt(trackingCount)} accent="accent" />
          <StatCell label="clippers (active)" value={fmtInt(activeClippers)} />
        </div>

        <OverviewCharts
          impressions={impressionsSeries}
          clipsSubmitted={clipsSubmittedSeries}
          newClippersPerDay={newClippersSeries}
          avgPerClip={avgPerClipSeries}
          granularity={granularity}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="flex flex-col gap-3">
            <h2 className="label">top clippers</h2>
            <div className="border border-border">
              <Table>
                <THead>
                  <TH>#</TH>
                  <TH>handle</TH>
                  <TH>impressions</TH>
                </THead>
                <TBody>
                  {topClippers.map((row, i) => (
                    <TR key={row.id}>
                      <TD className="font-mono text-text-3">{i + 1}</TD>
                      <TD className="font-mono">
                        <Link
                          href={`/admin/clippers/${row.id}` as never}
                          className="hover:underline"
                        >
                          @{row.handle}
                        </Link>
                      </TD>
                      <TD className="num">{fmtInt(row.impressions)}</TD>
                    </TR>
                  ))}
                  {topClippers.length === 0 && (
                    <TR>
                      <TD className="text-text-3 font-mono text-sm">no data</TD>
                      <TD /><TD />
                    </TR>
                  )}
                </TBody>
              </Table>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="label">top clips</h2>
            <div className="border border-border">
              <Table>
                <THead>
                  <TH>#</TH>
                  <TH>clipper</TH>
                  <TH>tweet</TH>
                  <TH>impressions</TH>
                </THead>
                <TBody>
                  {topClips.map((row, i) => (
                    <TR key={row.id}>
                      <TD className="font-mono text-text-3">{i + 1}</TD>
                      <TD className="font-mono text-xs">
                        <Link
                          href={`/admin/clippers/${row.clipperId}` as never}
                          className="hover:underline"
                        >
                          @{row.handle}
                        </Link>
                      </TD>
                      <TD className="font-mono text-xs text-text-2 max-w-[200px] truncate">
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {row.url}
                        </a>
                      </TD>
                      <TD className="num">{fmtInt(row.impressions)}</TD>
                    </TR>
                  ))}
                  {topClips.length === 0 && (
                    <TR>
                      <TD className="text-text-3 font-mono text-sm">no data</TD>
                      <TD /><TD /><TD />
                    </TR>
                  )}
                </TBody>
              </Table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function daysAgo(now: Date, n: number): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function hoursAgo(now: Date, n: number): Date {
  const d = new Date(now);
  d.setUTCHours(d.getUTCHours() - n, 0, 0, 0);
  return d;
}

type SnapshotRow = { clip_id: string; impressions: number; captured_at: string };

// Pages through every in-window snapshot. PostgREST caps each response at
// 1000 rows, so we walk .range() windows until a short page signals the end.
// Previously capped at 200k for safety, but that quietly cut off the most
// recent snapshots once the project grew (we page ascending by captured_at,
// so the oldest snapshots filled the cap first and the chart flat-lined for
// recent days). Ceiling raised to 5M — well above realistic in-window snapshot
// counts and high enough that hitting it means there's a real scale problem
// to solve, not silently bad charts.
async function fetchWindowSnapshots(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  startIso: string,
): Promise<SnapshotRow[]> {
  const pageSize = 1000;
  const safetyCeiling = 5_000_000;
  const out: SnapshotRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("clip_impression_snapshots")
      .select("clip_id, impressions, captured_at")
      .gte("captured_at", startIso)
      .order("captured_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    out.push(...(data as SnapshotRow[]));
    if (data.length < pageSize || out.length >= safetyCeiling) break;
  }
  return out;
}

type BaseParams = {
  range: DateRange;
  creator: string | undefined;
  topic: string | undefined;
  status: StatusFilter | undefined;
  campaign: string | undefined;
  partner: string | undefined;
};

function buildHref(
  base: BaseParams,
  param: keyof BaseParams,
  value: string | undefined,
): string {
  const next = { ...base, [param]: value };
  const params = new URLSearchParams();
  if (next.range && next.range !== "30d") params.set("range", next.range);
  if (next.creator) params.set("creator", next.creator);
  if (next.topic) params.set("topic", next.topic);
  if (next.status) params.set("status", next.status);
  if (next.campaign) params.set("campaign", next.campaign);
  if (next.partner) params.set("partner", next.partner);
  const qs = params.toString();
  return qs ? `/admin?${qs}` : "/admin";
}

function FilterRow({
  label,
  base,
  param,
  value,
  options,
  defaultValue,
  allowClear,
}: {
  label: string;
  base: BaseParams;
  param: "range" | "creator" | "topic" | "status" | "campaign" | "partner";
  value: string | undefined;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
  allowClear: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-text-3 w-20">
        {label}:
      </span>
      {allowClear && (
        <a
          href={buildHref(base, param, undefined)}
          className={`btn ${!value ? "btn-primary" : "btn-ghost"}`}
          style={!value ? { background: "var(--admin)" } : undefined}
        >
          all
        </a>
      )}
      {options.map((opt) => {
        const on = (value ?? defaultValue) === opt.value;
        return (
          <a
            key={opt.value}
            href={buildHref(base, param, on && allowClear ? undefined : opt.value)}
            className={`btn ${on ? "btn-primary" : "btn-ghost"}`}
            style={on ? { background: "var(--admin)" } : undefined}
          >
            {opt.label}
          </a>
        );
      })}
    </div>
  );
}
