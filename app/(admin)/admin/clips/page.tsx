import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtRelative, fmtUsd } from "@/lib/format";
import { OverrideClipButton } from "@/components/admin/OverrideClipButton";
import { RejectClipButton } from "@/components/admin/RejectClipButton";
import { DeleteClipButton } from "@/components/admin/DeleteClipButton";
import { FlagButton } from "@/components/admin/FlagButton";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminClipsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; flagged?: string }>;
}) {
  const { status, flagged } = await searchParams;
  const admin = createSupabaseAdminClient();

  let q = admin.from("clips").select("*, clipper:clippers(x_handle)").order("submitted_at", {
    ascending: false,
  });
  if (status === "tracking" || status === "completed" || status === "rejected") {
    q = q.eq("status", status);
  }
  const { data: clips } = await q.limit(500);

  const clipIds = (clips ?? []).map((c) => c.id);
  const { data: openFlags } = clipIds.length
    ? await admin
        .from("clip_flags")
        .select("clip_id")
        .in("clip_id", clipIds)
        .is("resolved_at", null)
    : { data: [] as { clip_id: string }[] };
  const flagCount = new Map<string, number>();
  for (const f of openFlags ?? []) {
    flagCount.set(f.clip_id, (flagCount.get(f.clip_id) ?? 0) + 1);
  }
  const filtered = flagged === "1" ? (clips ?? []).filter((c) => flagCount.has(c.id)) : (clips ?? []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "CLIPS" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter current={status} flagged={flagged} value={undefined} label="all" />
          <Filter current={status} flagged={flagged} value="tracking" label="tracking" />
          <Filter current={status} flagged={flagged} value="completed" label="completed" />
          <Filter current={status} flagged={flagged} value="rejected" label="rejected" />
          <a
            href={flagged === "1" ? `/admin/clips${status ? `?status=${status}` : ""}` : `/admin/clips?${new URLSearchParams({ ...(status ? { status } : {}), flagged: "1" }).toString()}`}
            className={`btn ${flagged === "1" ? "btn-primary" : "btn-ghost"}`}
            style={flagged === "1" ? { background: "var(--admin)" } : undefined}
          >
            flagged ⚑
          </a>
        </div>

        <div className="border border-border">
          <Table>
            <THead>
              <TH>handle</TH>
              <TH>tweet</TH>
              <TH>submitted</TH>
              <TH>impressions</TH>
              <TH>earned</TH>
              <TH>status</TH>
              <TH />
              <TH />
              <TH />
              <TH />
            </THead>
            <TBody>
              {filtered.map((c) => {
                const fc = flagCount.get(c.id) ?? 0;
                return (
                  <TR key={c.id}>
                    <TD className="font-mono">@{(c as any).clipper?.x_handle ?? "—"}</TD>
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
                  <TD className="text-text-3 font-mono text-sm">no clips</TD>
                  <TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD />
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      </main>
    </div>
  );
}

function Filter({
  current,
  flagged,
  value,
  label,
}: {
  current: string | undefined;
  flagged: string | undefined;
  value: string | undefined;
  label: string;
}) {
  const active = current === value;
  const params = new URLSearchParams();
  if (value) params.set("status", value);
  if (flagged === "1") params.set("flagged", "1");
  const qs = params.toString();
  const href = qs ? `/admin/clips?${qs}` : "/admin/clips";
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
