import Link from "next/link";
import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { StatCell, StatGrid } from "@/components/ui/StatCell";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtRelative } from "@/lib/format";
import { AdminNav } from "@/components/admin/AdminNav";
import { FlagResolveButton } from "@/components/admin/FlagResolveButton";
import { FlagDeleteButton } from "@/components/admin/FlagDeleteButton";
import {
  FlagsOverTimeChart,
  FlaggedImpressionsByCreatorChart,
  type FlagsSeriesPoint,
} from "@/components/admin/FlagsCharts";
import { dateRange, toYmd } from "@/lib/chart-data";

export const dynamic = "force-dynamic";

type Range = "7d" | "30d" | "90d" | "all";
const VALID_RANGES: Range[] = ["7d", "30d", "90d", "all"];

export default async function AdminFlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; range?: string; creator?: string }>;
}) {
  const sp = await searchParams;
  const showResolved = sp.state === "resolved";
  const range = (VALID_RANGES as string[]).includes(sp.range ?? "")
    ? (sp.range as Range)
    : ("all" as Range);
  const creatorHandle = (sp.creator ?? "").trim().replace(/^@/, "") || undefined;

  const admin = createSupabaseAdminClient();

  // Resolve date window. "all" goes back a year for charting purposes.
  const now = new Date();
  let start: Date;
  if (range === "7d") start = daysAgo(now, 7);
  else if (range === "30d") start = daysAgo(now, 30);
  else if (range === "90d") start = daysAgo(now, 90);
  else start = daysAgo(now, 365);

  let clipperQ = admin
    .from("clipper_flags")
    .select("*, clipper:clippers(id, x_handle)")
    .order("flagged_at", { ascending: false });
  let clipQ = admin
    .from("clip_flags")
    .select(
      "*, clip:clips(id, url, clipper_id, impressions, final_impressions, admin_override_impressions, clipper:clippers(id, x_handle))",
    )
    .order("flagged_at", { ascending: false });

  if (!showResolved) {
    clipperQ = clipperQ.is("resolved_at", null);
    clipQ = clipQ.is("resolved_at", null);
  }
  if (range !== "all") {
    clipperQ = clipperQ.gte("flagged_at", start.toISOString());
    clipQ = clipQ.gte("flagged_at", start.toISOString());
  }

  const [{ data: clipperFlagsRaw }, { data: clipFlagsRaw }] = await Promise.all([
    clipperQ.limit(1000),
    clipQ.limit(1000),
  ]);

  // Filter by creator handle if specified.
  const matchesCreator = (handle: string | undefined | null): boolean => {
    if (!creatorHandle) return true;
    return (handle ?? "").toLowerCase() === creatorHandle.toLowerCase();
  };
  const clipperFlags = (clipperFlagsRaw ?? []).filter((f: any) =>
    matchesCreator(f.clipper?.x_handle),
  );
  const clipFlags = (clipFlagsRaw ?? []).filter((f: any) =>
    matchesCreator(f.clip?.clipper?.x_handle),
  );

  // Resolve impression count for a clip (mirrors admin overview logic).
  const clipImpressions = (clip: any): number => {
    if (!clip) return 0;
    return Number(
      clip.admin_override_impressions ??
        clip.final_impressions ??
        clip.impressions ??
        0,
    );
  };

  // Build the set of unique flagged clips (one clip can have several flags).
  const uniqueClipMap = new Map<
    string,
    { id: string; impressions: number; handle: string; clipperId: string }
  >();
  for (const f of clipFlags) {
    const c = f.clip;
    if (!c) continue;
    if (uniqueClipMap.has(c.id)) continue;
    uniqueClipMap.set(c.id, {
      id: c.id,
      impressions: clipImpressions(c),
      handle: c.clipper?.x_handle ?? "—",
      clipperId: c.clipper_id,
    });
  }
  const uniqueClips = Array.from(uniqueClipMap.values());

  const uniqueFlaggedClippers = new Set<string>();
  for (const f of clipperFlags) {
    if (f.clipper?.id) uniqueFlaggedClippers.add(f.clipper.id);
  }

  const totalFlaggedClips = uniqueClips.length;
  const totalFlaggedImpressions = uniqueClips.reduce(
    (s, c) => s + c.impressions,
    0,
  );
  const totalClipFlags = clipFlags.length;
  const totalClipperFlags = clipperFlags.length;
  const totalFlaggedClippers = uniqueFlaggedClippers.size;
  const openClipFlags = clipFlags.filter((f: any) => !f.resolved_at).length;
  const openClipperFlags = clipperFlags.filter((f: any) => !f.resolved_at).length;

  // Per-creator breakdown: unique flagged clips + impressions per creator.
  type CreatorRow = {
    clipperId: string;
    handle: string;
    clipCount: number;
    impressions: number;
    flagCount: number;
  };
  const byCreator = new Map<string, CreatorRow>();
  for (const c of uniqueClips) {
    const row = byCreator.get(c.clipperId) ?? {
      clipperId: c.clipperId,
      handle: c.handle,
      clipCount: 0,
      impressions: 0,
      flagCount: 0,
    };
    row.clipCount += 1;
    row.impressions += c.impressions;
    byCreator.set(c.clipperId, row);
  }
  // Roll flag counts (a clip can have multiple flags).
  for (const f of clipFlags) {
    const c = f.clip;
    if (!c) continue;
    const row = byCreator.get(c.clipper_id);
    if (row) row.flagCount += 1;
  }
  const creatorRows = Array.from(byCreator.values()).sort(
    (a, b) => b.impressions - a.impressions || b.clipCount - a.clipCount,
  );

  // Time series for the "flags created per day" chart.
  const days = dateRange(start, now);
  const seriesMap = new Map<string, FlagsSeriesPoint>();
  for (const d of days) seriesMap.set(d, { date: d, clip: 0, clipper: 0 });
  for (const f of clipFlags) {
    const d = toYmd(f.flagged_at);
    const point = seriesMap.get(d);
    if (point) point.clip += 1;
  }
  for (const f of clipperFlags) {
    const d = toYmd(f.flagged_at);
    const point = seriesMap.get(d);
    if (point) point.clipper += 1;
  }
  const series = days.map((d) => seriesMap.get(d)!);

  const topCreatorImpressions = creatorRows.slice(0, 10).map((r) => ({
    handle: `@${r.handle}`,
    impressions: r.impressions,
  }));

  const baseParams = { state: sp.state, range, creator: creatorHandle };

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "FLAGS" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-8">
        {/* Filters */}
        <div className="flex flex-col gap-3">
          <FilterRow
            label="state"
            base={baseParams}
            param="state"
            value={showResolved ? "resolved" : "open"}
            options={[
              { value: "open", label: "open" },
              { value: "resolved", label: "all (incl. resolved)" },
            ]}
            defaultValue="open"
            allowClear={false}
          />
          <FilterRow
            label="range"
            base={baseParams}
            param="range"
            value={range}
            options={[
              { value: "7d", label: "7d" },
              { value: "30d", label: "30d" },
              { value: "90d", label: "90d" },
              { value: "all", label: "all" },
            ]}
            defaultValue="all"
            allowClear={false}
          />
          <CreatorFilter base={baseParams} value={creatorHandle} />
        </div>

        {/* KPIs */}
        <StatGrid>
          <StatCell
            label="flagged clips"
            value={fmtInt(totalFlaggedClips)}
            hint={`${fmtInt(totalClipFlags)} flag${totalClipFlags === 1 ? "" : "s"} total`}
            accent="admin"
          />
          <StatCell
            label="flagged impressions"
            value={fmtInt(totalFlaggedImpressions)}
            hint="sum across unique flagged clips"
          />
          <StatCell
            label="flagged clippers"
            value={fmtInt(totalFlaggedClippers)}
            hint={`${fmtInt(totalClipperFlags)} flag${totalClipperFlags === 1 ? "" : "s"} total`}
            accent="admin"
          />
          <StatCell
            label="open flags"
            value={fmtInt(openClipFlags + openClipperFlags)}
            hint={`${fmtInt(openClipFlags)} clip · ${fmtInt(openClipperFlags)} clipper`}
            accent="danger"
          />
        </StatGrid>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <FlagsOverTimeChart data={series} />
          <FlaggedImpressionsByCreatorChart data={topCreatorImpressions} />
        </div>

        {/* Per-creator breakdown */}
        <section className="flex flex-col gap-3">
          <h2 className="label">by creator</h2>
          <div className="border border-border">
            <Table>
              <THead>
                <TH>handle</TH>
                <TH>flagged clips</TH>
                <TH>total flags</TH>
                <TH>flagged impressions</TH>
                <TH />
              </THead>
              <TBody>
                {creatorRows.map((row) => (
                  <TR key={row.clipperId}>
                    <TD className="font-mono">
                      <Link
                        href={`/admin/clippers/${row.clipperId}` as never}
                        className="hover:underline"
                      >
                        @{row.handle}
                      </Link>
                    </TD>
                    <TD className="num">{fmtInt(row.clipCount)}</TD>
                    <TD className="num text-text-2">{fmtInt(row.flagCount)}</TD>
                    <TD className="num">{fmtInt(row.impressions)}</TD>
                    <TD className="font-mono text-[10px]">
                      <a
                        href={buildHref(baseParams, "creator", row.handle)}
                        className="text-admin hover:underline"
                      >
                        filter →
                      </a>
                    </TD>
                  </TR>
                ))}
                {creatorRows.length === 0 && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm">
                      no flagged clips
                    </TD>
                    <TD /><TD /><TD /><TD />
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="label">flagged users</h2>
          <div className="border border-border">
            <Table>
              <THead>
                <TH>handle</TH>
                <TH>reason</TH>
                <TH>flagged</TH>
                <TH>state</TH>
                <TH />
                <TH />
              </THead>
              <TBody>
                {clipperFlags.map((f: any) => (
                  <TR key={f.id}>
                    <TD className="font-mono">
                      {f.clipper ? (
                        <Link
                          href={`/admin/clippers/${f.clipper.id}` as never}
                          className="hover:underline"
                        >
                          @{f.clipper.x_handle}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="font-mono text-xs text-text-2 max-w-[400px] truncate">
                      <span title={f.reason}>{f.reason}</span>
                    </TD>
                    <TD className="font-mono text-xs text-text-2">{fmtRelative(f.flagged_at)}</TD>
                    <TD className="font-mono text-[10px] uppercase tracking-widest">
                      {f.resolved_at ? (
                        <span className="text-text-3" title={f.resolution ?? ""}>
                          resolved
                        </span>
                      ) : (
                        <span className="text-admin">open</span>
                      )}
                    </TD>
                    <TD>
                      {!f.resolved_at && <FlagResolveButton kind="clipper" flagId={f.id} />}
                    </TD>
                    <TD>
                      <FlagDeleteButton kind="clipper" flagId={f.id} />
                    </TD>
                  </TR>
                ))}
                {clipperFlags.length === 0 && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm">no flagged users</TD>
                    <TD /><TD /><TD /><TD /><TD />
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="label">flagged clips</h2>
          <div className="border border-border">
            <Table>
              <THead>
                <TH>handle</TH>
                <TH>tweet</TH>
                <TH>impressions</TH>
                <TH>reason</TH>
                <TH>flagged</TH>
                <TH>state</TH>
                <TH />
                <TH />
              </THead>
              <TBody>
                {clipFlags.map((f: any) => (
                  <TR key={f.id}>
                    <TD className="font-mono">
                      {f.clip?.clipper ? (
                        <Link
                          href={`/admin/clippers/${f.clip.clipper_id}` as never}
                          className="hover:underline"
                        >
                          @{f.clip.clipper.x_handle}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="font-mono text-xs text-text-2 max-w-[260px] truncate">
                      {f.clip?.url ? (
                        <a
                          href={f.clip.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {f.clip.url}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="num">{fmtInt(clipImpressions(f.clip))}</TD>
                    <TD className="font-mono text-xs text-text-2 max-w-[300px] truncate">
                      <span title={f.reason}>{f.reason}</span>
                    </TD>
                    <TD className="font-mono text-xs text-text-2">{fmtRelative(f.flagged_at)}</TD>
                    <TD className="font-mono text-[10px] uppercase tracking-widest">
                      {f.resolved_at ? (
                        <span className="text-text-3" title={f.resolution ?? ""}>
                          resolved
                        </span>
                      ) : (
                        <span className="text-admin">open</span>
                      )}
                    </TD>
                    <TD>
                      {!f.resolved_at && <FlagResolveButton kind="clip" flagId={f.id} />}
                    </TD>
                    <TD>
                      <FlagDeleteButton kind="clip" flagId={f.id} />
                    </TD>
                  </TR>
                ))}
                {clipFlags.length === 0 && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm">no flagged clips</TD>
                    <TD /><TD /><TD /><TD /><TD /><TD /><TD />
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
        </section>
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

type BaseParams = {
  state: string | undefined;
  range: Range;
  creator: string | undefined;
};

function buildHref(
  base: BaseParams,
  param: keyof BaseParams,
  value: string | undefined,
): string {
  const next = { ...base, [param]: value };
  const params = new URLSearchParams();
  if (next.state === "resolved") params.set("state", "resolved");
  if (next.range && next.range !== "all") params.set("range", next.range);
  if (next.creator) params.set("creator", next.creator);
  const qs = params.toString();
  return qs ? `/admin/flags?${qs}` : "/admin/flags";
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
  param: keyof BaseParams;
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

function CreatorFilter({
  base,
  value,
}: {
  base: BaseParams;
  value: string | undefined;
}) {
  return (
    <form action="/admin/flags" method="get" className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-text-3 w-20">
        creator:
      </span>
      {base.state === "resolved" && <input type="hidden" name="state" value="resolved" />}
      {base.range !== "all" && <input type="hidden" name="range" value={base.range} />}
      <input
        type="text"
        name="creator"
        defaultValue={value ?? ""}
        placeholder="@handle"
        className="font-mono text-xs bg-bg border border-border px-2 py-1 w-48"
      />
      <button type="submit" className="btn btn-ghost">
        filter
      </button>
      {value && (
        <a href={buildHref(base, "creator", undefined)} className="btn btn-ghost">
          clear
        </a>
      )}
    </form>
  );
}
