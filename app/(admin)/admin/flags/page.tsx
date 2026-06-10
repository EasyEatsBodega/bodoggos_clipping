import Link from "next/link";
import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtRelative } from "@/lib/format";
import { AdminNav } from "@/components/admin/AdminNav";
import { FlagResolveButton } from "@/components/admin/FlagResolveButton";
import { FlagDeleteButton } from "@/components/admin/FlagDeleteButton";
import {
  BulkFlagResolveProvider,
  BulkFlagCheckbox,
  BulkFlagSelectAll,
} from "@/components/admin/BulkFlagResolve";

export const dynamic = "force-dynamic";

export default async function AdminFlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;
  const showResolved = state === "resolved";
  const admin = createSupabaseAdminClient();

  let clipperQ = admin
    .from("clipper_flags")
    .select("*, clipper:clippers(id, x_handle)")
    .order("flagged_at", { ascending: false });
  let clipQ = admin
    .from("clip_flags")
    .select("*, clip:clips(id, url, clipper_id, clipper:clippers(x_handle))")
    .order("flagged_at", { ascending: false });

  if (!showResolved) {
    clipperQ = clipperQ.is("resolved_at", null);
    clipQ = clipQ.is("resolved_at", null);
  }

  const [{ data: clipperFlags }, { data: clipFlags }] = await Promise.all([
    clipperQ.limit(500),
    clipQ.limit(500),
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "FLAGS" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-8">
        <div className="flex items-center gap-2">
          <a
            href="/admin/flags"
            className={`btn ${!showResolved ? "btn-primary" : "btn-ghost"}`}
            style={!showResolved ? { background: "var(--admin)" } : undefined}
          >
            open
          </a>
          <a
            href="/admin/flags?state=resolved"
            className={`btn ${showResolved ? "btn-primary" : "btn-ghost"}`}
            style={showResolved ? { background: "var(--admin)" } : undefined}
          >
            all (incl. resolved)
          </a>
        </div>

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
                {(clipperFlags ?? []).map((f: any) => (
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
                {(!clipperFlags || clipperFlags.length === 0) && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm">no flagged users</TD>
                    <TD /><TD /><TD /><TD /><TD />
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
        </section>

        <BulkFlagResolveProvider>
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="label">flagged clips</h2>
            <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
              select open flags below to dismiss false positives in bulk
            </span>
          </div>
          <div className="border border-border">
            <Table>
              <THead>
                <TH>
                  <BulkFlagSelectAll
                    ids={(clipFlags ?? [])
                      .filter((f: any) => !f.resolved_at)
                      .map((f: any) => f.id)}
                  />
                </TH>
                <TH>handle</TH>
                <TH>tweet</TH>
                <TH>reason</TH>
                <TH>flagged</TH>
                <TH>state</TH>
                <TH />
                <TH />
              </THead>
              <TBody>
                {(clipFlags ?? []).map((f: any) => (
                  <TR key={f.id}>
                    <TD>
                      <BulkFlagCheckbox flagId={f.id} disabled={!!f.resolved_at} />
                    </TD>
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
                {(!clipFlags || clipFlags.length === 0) && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm">no flagged clips</TD>
                    <TD /><TD /><TD /><TD /><TD /><TD /><TD />
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
        </section>
        </BulkFlagResolveProvider>
      </main>
    </div>
  );
}
