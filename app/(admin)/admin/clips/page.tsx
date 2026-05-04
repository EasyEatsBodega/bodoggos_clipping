import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtRelative, fmtUsd } from "@/lib/format";
import { OverrideClipButton } from "@/components/admin/OverrideClipButton";
import { RejectClipButton } from "@/components/admin/RejectClipButton";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminClipsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const admin = createSupabaseAdminClient();

  let q = admin.from("clips").select("*, clipper:clippers(x_handle)").order("submitted_at", {
    ascending: false,
  });
  if (status === "tracking" || status === "completed" || status === "rejected") {
    q = q.eq("status", status);
  }
  const { data: clips } = await q.limit(500);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "CLIPS" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <Filter current={status} value={undefined} label="all" />
          <Filter current={status} value="tracking" label="tracking" />
          <Filter current={status} value="completed" label="completed" />
          <Filter current={status} value="rejected" label="rejected" />
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
            </THead>
            <TBody>
              {(clips ?? []).map((c) => (
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
                  <TD className="font-mono text-[10px] uppercase tracking-widest">{c.status}</TD>
                  <TD>
                    <OverrideClipButton clipId={c.id} current={c.impressions} />
                  </TD>
                  <TD>
                    <RejectClipButton clipId={c.id} status={c.status} />
                  </TD>
                </TR>
              ))}
              {(!clips || clips.length === 0) && (
                <TR>
                  <TD className="text-text-3 font-mono text-sm">no clips</TD>
                  <TD /><TD /><TD /><TD /><TD /><TD /><TD />
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
  value,
  label,
}: {
  current: string | undefined;
  value: string | undefined;
  label: string;
}) {
  const active = current === value;
  const href = value ? `/admin/clips?status=${value}` : "/admin/clips";
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
