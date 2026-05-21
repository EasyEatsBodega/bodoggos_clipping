import Link from "next/link";
import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { StatCell, StatGrid } from "@/components/ui/StatCell";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtInt, fmtUsd } from "@/lib/format";
import { computePayoutCents } from "@/lib/payout-calc";
import { AdminNav } from "@/components/admin/AdminNav";
import { CreateTagForm } from "@/components/admin/CreateTagForm";
import { DeleteTagButton } from "@/components/admin/DeleteTagButton";

export const dynamic = "force-dynamic";

type TagStats = {
  clips: number;
  impressions: number;
  earnedCents: number;
  inFlightCents: number;
};

const emptyStats = (): TagStats => ({
  clips: 0,
  impressions: 0,
  earnedCents: 0,
  inFlightCents: 0,
});

export default async function AdminTagsPage() {
  const admin = createSupabaseAdminClient();

  const [{ data: tags }, { data: assignments }, { data: clips }] = await Promise.all([
    admin
      .from("clip_tags")
      .select("*")
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
    admin.from("clip_tag_assignments").select("clip_id, tag_id"),
    admin
      .from("clips")
      .select(
        "id, status, impressions, final_impressions, payout_amount, cpm_rate_snapshot, max_payout_snapshot, flat_fee_snapshot, min_views_snapshot",
      ),
  ]);

  const clipById = new Map(
    (clips ?? []).map((c) => [c.id, c] as const),
  );

  const stats = new Map<string, TagStats>();
  for (const a of assignments ?? []) {
    const c = clipById.get(a.clip_id);
    if (!c) continue;
    const cur = stats.get(a.tag_id) ?? emptyStats();
    cur.clips++;
    cur.impressions += Number(c.final_impressions ?? c.impressions ?? 0);
    cur.earnedCents += Math.round(Number(c.payout_amount ?? 0) * 100);
    if (c.status === "tracking") {
      cur.inFlightCents += computePayoutCents(
        Number(c.impressions ?? 0),
        c.cpm_rate_snapshot,
        c.max_payout_snapshot,
        c.flat_fee_snapshot ?? 0,
        c.min_views_snapshot ?? 0,
      );
    }
    stats.set(a.tag_id, cur);
  }

  const totalTaggedClips = (assignments ?? []).length;
  const untaggedClipCount =
    (clips ?? []).filter((c) => !(assignments ?? []).some((a) => a.clip_id === c.id)).length;

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "TAGS" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-8">
        <StatGrid>
          <StatCell label="tags" value={fmtInt(tags?.length ?? 0)} />
          <StatCell label="tagged assignments" value={fmtInt(totalTaggedClips)} />
          <StatCell label="untagged clips" value={fmtInt(untaggedClipCount)} accent="admin" />
          <StatCell label="total clips" value={fmtInt(clips?.length ?? 0)} />
        </StatGrid>

        <CreateTagForm />

        <section className="flex flex-col gap-3">
          <h2 className="label">tag metrics</h2>
          <div className="border border-border">
            <Table>
              <THead>
                <TH>tag</TH>
                <TH>kind</TH>
                <TH>slug</TH>
                <TH>clips</TH>
                <TH>impressions</TH>
                <TH>earned</TH>
                <TH>in-flight</TH>
                <TH />
              </THead>
              <TBody>
                {(tags ?? []).map((t) => {
                  const s = stats.get(t.id) ?? emptyStats();
                  const linkColor =
                    t.kind === "creator"
                      ? "var(--accent)"
                      : t.kind === "partner"
                        ? "var(--partner)"
                        : "var(--admin)";
                  return (
                    <TR key={t.id}>
                      <TD className="font-mono">
                        <Link
                          href={`/admin/clips?tag=${t.slug}` as never}
                          className="hover:underline"
                          style={{ color: linkColor }}
                        >
                          {t.label}
                        </Link>
                      </TD>
                      <TD className="font-mono text-[10px] uppercase tracking-widest text-text-2">
                        {t.kind ?? "topic"}
                      </TD>
                      <TD className="font-mono text-xs text-text-2">{t.slug}</TD>
                      <TD className="num">{fmtInt(s.clips)}</TD>
                      <TD className="num">{fmtInt(s.impressions)}</TD>
                      <TD className="num">{fmtUsd((s.earnedCents / 100).toFixed(2))}</TD>
                      <TD className="num text-text-2">
                        <span title="estimate from clips still tracking">
                          {s.inFlightCents > 0
                            ? `~${fmtUsd((s.inFlightCents / 100).toFixed(2))}`
                            : "—"}
                        </span>
                      </TD>
                      <TD>
                        <DeleteTagButton tagId={t.id} label={t.label} usage={s.clips} />
                      </TD>
                    </TR>
                  );
                })}
                {(!tags || tags.length === 0) && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm">no tags yet</TD>
                    <TD /><TD /><TD /><TD /><TD /><TD /><TD />
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
          <p className="font-mono text-[10px] text-text-3 uppercase tracking-widest">
            * a clip can carry multiple tags, so the sum of per-tag clips can exceed total clips.
          </p>
        </section>
      </main>
    </div>
  );
}
