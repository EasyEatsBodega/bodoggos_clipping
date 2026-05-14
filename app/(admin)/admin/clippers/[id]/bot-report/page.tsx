import { notFound } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { StatCell, StatGrid } from "@/components/ui/StatCell";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtRelative } from "@/lib/format";
import { AdminNav } from "@/components/admin/AdminNav";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

// Shareable per-clipper "suspected engagement farming" report. Lists each
// clip we've flagged for botting, the reason we typed in, and the
// impressions on each clip. The clipper handle is at the top so the
// whole page can be screenshotted or printed and sent to that specific
// clipper.
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
      "id, url, impressions, final_impressions, status, submitted_at, botting_reason, botting_marked_at",
    )
    .eq("clipper_id", id)
    .eq("botting_suspected", true)
    .order("botting_marked_at", { ascending: false });

  const clips = flaggedClips ?? [];
  const totalImpressions = clips.reduce(
    (s, c) => s + Number(c.final_impressions ?? c.impressions ?? 0),
    0,
  );
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

        <section className="flex flex-col gap-3">
          <h2 className="label">flagged clips</h2>
          <div className="border border-border overflow-x-auto">
            <table className="w-full border-collapse table-fixed text-xs">
              <colgroup>
                <col style={{ width: "40px" }} />
                <col />
                <col style={{ width: "110px" }} />
                <col style={{ width: "100px" }} />
                <col style={{ width: "100px" }} />
              </colgroup>
              <THead>
                <TH>#</TH>
                <TH>clip</TH>
                <TH className="text-right">impressions</TH>
                <TH>status</TH>
                <TH>submitted</TH>
              </THead>
              <TBody>
                {clips.map((c, i) => (
                  <TR key={c.id}>
                    <TD className="font-mono text-text-3">{i + 1}</TD>
                    <TD className="font-mono text-xs">
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline text-text break-all"
                      >
                        {shortenTweetUrl(c.url)}
                      </a>
                    </TD>
                    <TD className="num text-right">
                      {fmtInt(c.final_impressions ?? c.impressions ?? 0)}
                    </TD>
                    <TD className="font-mono text-[10px] uppercase tracking-widest text-text-2">
                      {c.status}
                    </TD>
                    <TD className="font-mono text-xs text-text-2">
                      {fmtRelative(c.submitted_at)}
                    </TD>
                  </TR>
                ))}
                {clips.length === 0 && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm">
                      no clips marked as suspected engagement farming for
                      this clipper.
                    </TD>
                    <TD /><TD /><TD /><TD />
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

