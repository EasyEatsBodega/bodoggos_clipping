import Link from "next/link";
import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtRelative, fmtUsd } from "@/lib/format";
import { OverrideClipButton } from "@/components/admin/OverrideClipButton";
import { RejectClipButton } from "@/components/admin/RejectClipButton";
import { DeleteClipButton } from "@/components/admin/DeleteClipButton";
import { FlagButton } from "@/components/admin/FlagButton";
import { TagPicker } from "@/components/admin/TagPicker";
import { AdminNav } from "@/components/admin/AdminNav";
import type { ClipTag } from "@/lib/db-types";

export const dynamic = "force-dynamic";

type SortCol = "handle" | "tweet" | "submitted" | "impressions" | "earned" | "status";

const VALID_SORT: SortCol[] = ["handle", "tweet", "submitted", "impressions", "earned", "status"];

export default async function AdminClipsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    flagged?: string;
    q?: string;
    clipper?: string;
    tag?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const status =
    sp.status === "tracking" || sp.status === "completed" || sp.status === "rejected"
      ? sp.status
      : undefined;
  const flagged = sp.flagged === "1";
  const q = (sp.q ?? "").trim();
  const clipperFilter = sp.clipper ?? undefined;
  const tagFilter = (sp.tag ?? "").trim() || undefined;
  const sortCol = (VALID_SORT as string[]).includes(sp.sort ?? "")
    ? (sp.sort as SortCol)
    : ("submitted" as SortCol);
  const sortDir = sp.dir === "asc" ? "asc" : "desc";

  const admin = createSupabaseAdminClient();

  const { data: allTags } = await admin
    .from("clip_tags")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  const tags: ClipTag[] = allTags ?? [];
  const tagBySlug = new Map(tags.map((t) => [t.slug, t]));
  const filterTag = tagFilter ? tagBySlug.get(tagFilter) ?? null : null;

  // If filtering by tag, restrict to clip_ids that carry that tag.
  let tagFilterClipIds: string[] | null = null;
  if (filterTag) {
    const { data } = await admin
      .from("clip_tag_assignments")
      .select("clip_id")
      .eq("tag_id", filterTag.id);
    tagFilterClipIds = (data ?? []).map((r) => r.clip_id);
    if (tagFilterClipIds.length === 0) {
      // Short-circuit: no clips carry this tag.
      tagFilterClipIds = ["00000000-0000-0000-0000-000000000000"];
    }
  }

  let handleClipperIds: string[] | null = null;
  if (q) {
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const { data: matches } = await admin
      .from("clippers")
      .select("id")
      .ilike("x_handle", like);
    handleClipperIds = (matches ?? []).map((m) => m.id);
  }

  let query = admin.from("clips").select("*, clipper:clippers(id, x_handle)");

  // Order at the DB level for columns that map directly. For "handle" we
  // sort in-memory after the join resolves.
  switch (sortCol) {
    case "submitted":
      query = query.order("submitted_at", { ascending: sortDir === "asc" });
      break;
    case "impressions":
      // final_impressions is null for tracking clips; supabase orders nulls last
      query = query
        .order("final_impressions", { ascending: sortDir === "asc", nullsFirst: false })
        .order("impressions", { ascending: sortDir === "asc" });
      break;
    case "earned":
      query = query.order("payout_amount", { ascending: sortDir === "asc", nullsFirst: false });
      break;
    case "status":
      query = query.order("status", { ascending: sortDir === "asc" });
      break;
    case "tweet":
      query = query.order("url", { ascending: sortDir === "asc" });
      break;
    case "handle":
      // Defer to in-memory sort below.
      query = query.order("submitted_at", { ascending: false });
      break;
  }

  if (status) query = query.eq("status", status);
  if (clipperFilter) query = query.eq("clipper_id", clipperFilter);
  if (tagFilterClipIds) query = query.in("id", tagFilterClipIds);
  if (q) {
    const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    if (handleClipperIds && handleClipperIds.length > 0) {
      const ids = handleClipperIds.map((id) => `"${id}"`).join(",");
      query = query.or(`url.ilike.${like},clipper_id.in.(${ids})`);
    } else {
      query = query.ilike("url", like);
    }
  }

  const { data: clipsRaw } = await query.limit(500);

  let clips = clipsRaw ?? [];
  if (sortCol === "handle") {
    const sign = sortDir === "asc" ? 1 : -1;
    clips = [...clips].sort(
      (a, b) =>
        sign *
        ((a as any).clipper?.x_handle ?? "").localeCompare(
          (b as any).clipper?.x_handle ?? "",
        ),
    );
  }

  let clipperFilterHandle: string | null = null;
  if (clipperFilter) {
    const { data } = await admin
      .from("clippers")
      .select("x_handle")
      .eq("id", clipperFilter)
      .maybeSingle();
    clipperFilterHandle = data?.x_handle ?? null;
  }

  const clipIds = clips.map((c) => c.id);
  const [{ data: openFlags }, { data: assignments }] = await Promise.all([
    clipIds.length
      ? admin
          .from("clip_flags")
          .select("clip_id")
          .in("clip_id", clipIds)
          .is("resolved_at", null)
      : Promise.resolve({ data: [] as { clip_id: string }[] }),
    clipIds.length
      ? admin
          .from("clip_tag_assignments")
          .select("clip_id, tag_id")
          .in("clip_id", clipIds)
      : Promise.resolve({ data: [] as { clip_id: string; tag_id: string }[] }),
  ]);
  const flagCount = new Map<string, number>();
  for (const f of openFlags ?? []) {
    flagCount.set(f.clip_id, (flagCount.get(f.clip_id) ?? 0) + 1);
  }
  const tagKindById = new Map(tags.map((t) => [t.id, t.kind] as const));
  const creatorIdsByClip = new Map<string, string[]>();
  const topicIdsByClip = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    const k = tagKindById.get(a.tag_id);
    const target = k === "creator" ? creatorIdsByClip : topicIdsByClip;
    const cur = target.get(a.clip_id) ?? [];
    cur.push(a.tag_id);
    target.set(a.clip_id, cur);
  }
  const filtered = flagged ? clips.filter((c) => flagCount.has(c.id)) : clips;

  const baseParams = { status, flagged, q, clipper: clipperFilter, tag: tagFilter };

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "CLIPS" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-6">
        <form
          method="get"
          action="/admin/clips"
          className="flex flex-wrap items-center gap-2"
        >
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="search handle or tweet url…"
            className="input-bare font-mono text-sm px-3 py-2 border border-border bg-transparent min-w-[260px]"
          />
          {status && <input type="hidden" name="status" value={status} />}
          {flagged && <input type="hidden" name="flagged" value="1" />}
          {clipperFilter && <input type="hidden" name="clipper" value={clipperFilter} />}
          {tagFilter && <input type="hidden" name="tag" value={tagFilter} />}
          {sortCol !== "submitted" && <input type="hidden" name="sort" value={sortCol} />}
          {sortDir !== "desc" && <input type="hidden" name="dir" value={sortDir} />}
          <button
            type="submit"
            className="font-mono text-[10px] uppercase tracking-widest px-3 py-2 border border-border hover:border-admin"
          >
            search
          </button>
          {(q || status || flagged || clipperFilter || tagFilter) && (
            <a
              href="/admin/clips"
              className="font-mono text-[10px] uppercase tracking-widest text-text-3 hover:text-text"
            >
              clear
            </a>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <Filter base={baseParams} sortCol={sortCol} sortDir={sortDir} value={undefined} label="all" />
          <Filter base={baseParams} sortCol={sortCol} sortDir={sortDir} value="tracking" label="tracking" />
          <Filter base={baseParams} sortCol={sortCol} sortDir={sortDir} value="completed" label="completed" />
          <Filter base={baseParams} sortCol={sortCol} sortDir={sortDir} value="rejected" label="rejected" />
          <span className="w-px h-5 bg-border mx-1" />
          <a
            href={buildHref({ ...baseParams, flagged: !flagged, sort: sortCol, dir: sortDir })}
            className={`btn ${flagged ? "btn-primary" : "btn-ghost"}`}
            style={flagged ? { background: "var(--admin)" } : undefined}
          >
            flagged ⚑
          </a>
          {clipperFilter && (
            <Link
              href={buildHref({ ...baseParams, clipper: undefined, sort: sortCol, dir: sortDir }) as never}
              className="btn btn-primary"
              style={{ background: "var(--admin)" }}
            >
              @{clipperFilterHandle ?? "clipper"} ✕
            </Link>
          )}
        </div>

        {(() => {
          const creatorTags = tags.filter((t) => t.kind === "creator");
          const topicTags = tags.filter((t) => t.kind !== "creator");
          return (
            <>
              {creatorTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
                    creator:
                  </span>
                  <a
                    href={buildHref({ ...baseParams, tag: undefined, sort: sortCol, dir: sortDir })}
                    className={`btn ${!tagFilter ? "btn-primary" : "btn-ghost"}`}
                    style={!tagFilter ? { background: "var(--admin)" } : undefined}
                  >
                    all
                  </a>
                  {creatorTags.map((t) => {
                    const on = tagFilter === t.slug;
                    return (
                      <a
                        key={t.id}
                        href={buildHref({ ...baseParams, tag: on ? undefined : t.slug, sort: sortCol, dir: sortDir })}
                        className={`btn ${on ? "btn-primary" : "btn-ghost"}`}
                        style={on ? { background: "var(--admin)" } : undefined}
                      >
                        {t.label}
                      </a>
                    );
                  })}
                </div>
              )}
              {topicTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
                    topic:
                  </span>
                  <a
                    href={buildHref({ ...baseParams, tag: undefined, sort: sortCol, dir: sortDir })}
                    className={`btn ${!tagFilter ? "btn-primary" : "btn-ghost"}`}
                    style={!tagFilter ? { background: "var(--admin)" } : undefined}
                  >
                    all
                  </a>
                  {topicTags.map((t) => {
                    const on = tagFilter === t.slug;
                    return (
                      <a
                        key={t.id}
                        href={buildHref({ ...baseParams, tag: on ? undefined : t.slug, sort: sortCol, dir: sortDir })}
                        className={`btn ${on ? "btn-primary" : "btn-ghost"}`}
                        style={on ? { background: "var(--admin)" } : undefined}
                      >
                        {t.label}
                      </a>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        <div className="border border-border">
          <Table>
            <THead>
              <SortTH base={baseParams} col="handle" sortCol={sortCol} sortDir={sortDir}>handle</SortTH>
              <SortTH base={baseParams} col="tweet" sortCol={sortCol} sortDir={sortDir}>tweet</SortTH>
              <SortTH base={baseParams} col="submitted" sortCol={sortCol} sortDir={sortDir}>submitted</SortTH>
              <SortTH base={baseParams} col="impressions" sortCol={sortCol} sortDir={sortDir}>impressions</SortTH>
              <SortTH base={baseParams} col="earned" sortCol={sortCol} sortDir={sortDir}>earned</SortTH>
              <SortTH base={baseParams} col="status" sortCol={sortCol} sortDir={sortDir}>status</SortTH>
              <TH>creator</TH>
              <TH>topic</TH>
              <TH />
              <TH />
              <TH />
              <TH />
            </THead>
            <TBody>
              {filtered.map((c) => {
                const fc = flagCount.get(c.id) ?? 0;
                const handle = (c as any).clipper?.x_handle ?? "—";
                const clipperId = (c as any).clipper?.id;
                return (
                  <TR key={c.id}>
                    <TD className="font-mono">
                      {clipperId ? (
                        <Link
                          href={`/admin/clippers/${clipperId}` as never}
                          className="hover:underline"
                        >
                          @{handle}
                        </Link>
                      ) : (
                        <>@{handle}</>
                      )}
                    </TD>
                    <TD className="font-mono text-xs text-text-2 max-w-[260px] truncate">
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {c.url}
                      </a>
                    </TD>
                    <TD className="font-mono text-xs text-text-2">{fmtRelative(c.submitted_at)}</TD>
                    <TD className="num">{fmtInt(c.final_impressions ?? c.impressions)}</TD>
                    <TD className="num">{c.payout_amount ? fmtUsd(c.payout_amount) : "—"}</TD>
                    <TD className="font-mono text-[10px] uppercase tracking-widest">
                      {c.status}
                      {fc > 0 && (
                        <span className="ml-2 text-admin" title={`${fc} open flag${fc === 1 ? "" : "s"}`}>
                          ⚑{fc > 1 ? fc : ""}
                        </span>
                      )}
                    </TD>
                    <TD>
                      <TagPicker
                        clipId={c.id}
                        allTags={tags}
                        initialTagIds={creatorIdsByClip.get(c.id) ?? []}
                        kind="creator"
                      />
                    </TD>
                    <TD>
                      <TagPicker
                        clipId={c.id}
                        allTags={tags}
                        initialTagIds={topicIdsByClip.get(c.id) ?? []}
                        kind="topic"
                      />
                    </TD>
                    <TD>
                      <OverrideClipButton clipId={c.id} current={c.impressions} />
                    </TD>
                    <TD>
                      <FlagButton target="clip" id={c.id} flagged={fc > 0} />
                    </TD>
                    <TD>
                      <RejectClipButton clipId={c.id} status={c.status} />
                    </TD>
                    <TD>
                      <DeleteClipButton clipId={c.id} />
                    </TD>
                  </TR>
                );
              })}
              {filtered.length === 0 && (
                <TR>
                  <TD className="text-text-3 font-mono text-sm">no clips match</TD>
                  <TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD />
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      </main>
    </div>
  );
}

type BaseParams = {
  status?: string;
  flagged: boolean;
  q: string;
  clipper?: string;
  tag?: string;
};

function buildHref(opts: BaseParams & { sort?: string; dir?: string }): string {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.flagged) params.set("flagged", "1");
  if (opts.q) params.set("q", opts.q);
  if (opts.clipper) params.set("clipper", opts.clipper);
  if (opts.tag) params.set("tag", opts.tag);
  if (opts.sort && opts.sort !== "submitted") params.set("sort", opts.sort);
  if (opts.dir && opts.dir !== "desc") params.set("dir", opts.dir);
  const qs = params.toString();
  return qs ? `/admin/clips?${qs}` : "/admin/clips";
}

function Filter({
  base,
  sortCol,
  sortDir,
  value,
  label,
}: {
  base: BaseParams;
  sortCol: string;
  sortDir: string;
  value: string | undefined;
  label: string;
}) {
  const active = base.status === value;
  const href = buildHref({ ...base, status: value, sort: sortCol, dir: sortDir });
  return (
    <a
      href={href}
      className={`btn ${active ? "btn-primary" : "btn-ghost"}`}
      style={active ? { background: "var(--admin)" } : undefined}
    >
      {label}
    </a>
  );
}

function SortTH({
  base,
  col,
  sortCol,
  sortDir,
  children,
}: {
  base: BaseParams;
  col: SortCol;
  sortCol: SortCol;
  sortDir: "asc" | "desc";
  children: React.ReactNode;
}) {
  const active = sortCol === col;
  const nextDir: "asc" | "desc" = active && sortDir === "desc" ? "asc" : "desc";
  const arrow = active ? (sortDir === "desc" ? "▼" : "▲") : "";
  const href = buildHref({ ...base, sort: col, dir: nextDir });
  return (
    <TH>
      <a
        href={href}
        className={`hover:text-text ${active ? "text-admin" : "text-text-2"}`}
      >
        <span>
          {children}
          {arrow && <span className="ml-1 text-[8px]">{arrow}</span>}
        </span>
      </a>
    </TH>
  );
}
