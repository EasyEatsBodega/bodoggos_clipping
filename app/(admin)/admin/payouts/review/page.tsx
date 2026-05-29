import Link from "next/link";
import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtRelative, fmtUsd } from "@/lib/format";
import { computePayoutCents } from "@/lib/payout-calc";
import { AdminNav } from "@/components/admin/AdminNav";
import { DeletePayoutButton } from "@/components/admin/DeletePayoutButton";
import { fetchAllPages } from "@/lib/queries";

export const dynamic = "force-dynamic";

const DUPE_WINDOW_DAYS = 7;
const UNEXPLAINED_CENT_THRESHOLD = 500; // $5 — ignore rounding-tier noise

type Payout = {
  id: string;
  clipper_id: string;
  amount: string;
  chain: string;
  tx_hash: string | null;
  paid_at: string;
  note: string | null;
};

type ClipForCalc = {
  clipper_id: string;
  status: "tracking" | "completed" | "rejected";
  impressions: number | null;
  payout_amount: string | null;
  cpm_rate_snapshot: string;
  max_payout_snapshot: string;
  flat_fee_snapshot: string | null;
  min_views_snapshot: number | null;
  botting_suspected: boolean | null;
};

export default async function AdminPayoutsReviewPage() {
  const admin = createSupabaseAdminClient();

  const [payouts, clips, clippers] = await Promise.all([
    fetchAllPages<Payout>((from, to) =>
      admin
        .from("payouts")
        .select("id, clipper_id, amount, chain, tx_hash, paid_at, note")
        .order("paid_at", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<ClipForCalc>((from, to) =>
      admin
        .from("clips")
        .select(
          "id, clipper_id, status, impressions, payout_amount, cpm_rate_snapshot, max_payout_snapshot, flat_fee_snapshot, min_views_snapshot, botting_suspected",
        )
        .order("id", { ascending: true })
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

  // ── 1. tx_hash duplicates ────────────────────────────────────────────
  const byTx = new Map<string, Payout[]>();
  for (const p of payouts) {
    if (!p.tx_hash) continue;
    const cur = byTx.get(p.tx_hash) ?? [];
    cur.push(p);
    byTx.set(p.tx_hash, cur);
  }
  const txDupes: Payout[][] = [];
  for (const group of byTx.values()) {
    if (group.length > 1) txDupes.push(group);
  }

  // ── 2. manual-entry "same clipper, same amount, close in time" ──────
  type DupePair = { earlier: Payout; later: Payout; gapHours: number };
  const manualDupes: DupePair[] = [];
  const byClipperAmount = new Map<string, Payout[]>();
  for (const p of payouts) {
    const key = `${p.clipper_id}::${p.amount}`;
    const cur = byClipperAmount.get(key) ?? [];
    cur.push(p);
    byClipperAmount.set(key, cur);
  }
  for (const group of byClipperAmount.values()) {
    if (group.length < 2) continue;
    // Already ordered by paid_at asc from the query.
    for (let i = 0; i < group.length - 1; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        // Skip pairs already explained by the tx_hash dupe section.
        if (a.tx_hash && a.tx_hash === b.tx_hash) continue;
        const gapMs = new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime();
        const gapDays = gapMs / 86_400_000;
        if (gapDays > DUPE_WINDOW_DAYS) break; // group is sorted; further pairs only widen
        manualDupes.push({ earlier: a, later: b, gapHours: gapMs / 3_600_000 });
      }
    }
  }
  manualDupes.sort((a, b) => a.gapHours - b.gapHours);

  // ── 3. Per-clipper gap analysis ─────────────────────────────────────
  type Row = {
    clipperId: string;
    handle: string;
    paidCents: number;
    earnedCents: number;
    inFlightCents: number;
    gapCents: number;
    unexplainedCents: number;
    payoutCount: number;
  };

  const stats = new Map<string, Row>();
  const getRow = (id: string): Row => {
    let r = stats.get(id);
    if (!r) {
      r = {
        clipperId: id,
        handle: handleOf.get(id) ?? "—",
        paidCents: 0,
        earnedCents: 0,
        inFlightCents: 0,
        gapCents: 0,
        unexplainedCents: 0,
        payoutCount: 0,
      };
      stats.set(id, r);
    }
    return r;
  };

  for (const p of payouts) {
    const r = getRow(p.clipper_id);
    r.paidCents += Math.round(Number(p.amount ?? 0) * 100);
    r.payoutCount++;
  }
  for (const c of clips) {
    if (c.status === "rejected") continue;
    if (c.botting_suspected) continue;
    const r = getRow(c.clipper_id);
    if (c.status === "completed") {
      r.earnedCents += Math.round(Number(c.payout_amount ?? 0) * 100);
    } else if (c.status === "tracking") {
      r.inFlightCents += computePayoutCents(
        Number(c.impressions ?? 0),
        c.cpm_rate_snapshot,
        c.max_payout_snapshot,
        c.flat_fee_snapshot ?? 0,
        c.min_views_snapshot ?? 0,
      );
    }
  }
  for (const r of stats.values()) {
    r.gapCents = r.paidCents - r.earnedCents;
    r.unexplainedCents = r.paidCents - r.earnedCents - r.inFlightCents;
  }
  const overpayRows = Array.from(stats.values())
    .filter((r) => r.unexplainedCents > UNEXPLAINED_CENT_THRESHOLD && r.payoutCount > 0)
    .sort((a, b) => b.unexplainedCents - a.unexplainedCents);

  // ── totals for the header ──────────────────────────────────────────
  const totalUnexplainedCents = overpayRows.reduce((s, r) => s + r.unexplainedCents, 0);

  const usd = (cents: number) => fmtUsd((cents / 100).toFixed(2));

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[
          { label: "ADMIN.OPS", href: "/admin" },
          { label: "PAYOUTS", href: "/admin/payouts" },
          { label: "REVIEW" },
        ]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-10">
        <section className="flex flex-col gap-2">
          <h2 className="label">payout sanity review</h2>
          <p className="font-mono text-xs text-text-2 max-w-2xl">
            Surfaces payouts that look like accidental duplicates and clippers
            whose paid total exceeds earned + in-flight by more than a few
            dollars. Use the <span className="text-admin">remove</span> buttons
            to delete a bad row (its per-clip watermarks cascade so the
            clipper&apos;s owed balance recalculates correctly).
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="label">tx_hash duplicates ({txDupes.length})</h3>
          {txDupes.length === 0 ? (
            <p className="font-mono text-xs text-text-3">
              none — the unique constraint on tx_hash is holding.
            </p>
          ) : (
            <div className="border border-border">
              <Table>
                <THead>
                  <TH>handle</TH>
                  <TH>tx_hash</TH>
                  <TH>amount</TH>
                  <TH>paid</TH>
                  <TH />
                </THead>
                <TBody>
                  {txDupes.flat().map((p) => (
                    <TR key={p.id}>
                      <TD className="font-mono">@{handleOf.get(p.clipper_id) ?? "—"}</TD>
                      <TD className="font-mono text-xs text-text-2 max-w-[260px] truncate">
                        {p.tx_hash}
                      </TD>
                      <TD className="num">{fmtUsd(p.amount)}</TD>
                      <TD className="font-mono text-xs text-text-2">{fmtRelative(p.paid_at)}</TD>
                      <TD>
                        <DeletePayoutButton
                          payoutId={p.id}
                          handle={handleOf.get(p.clipper_id) ?? "—"}
                          amount={p.amount}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="label">
            likely manual duplicates ({manualDupes.length})
          </h3>
          <p className="font-mono text-[10px] text-text-3 uppercase tracking-widest">
            same clipper, same amount, within {DUPE_WINDOW_DAYS} days, not both already linked by tx_hash.
          </p>
          {manualDupes.length === 0 ? (
            <p className="font-mono text-xs text-text-3">
              none — no obvious same-amount near-duplicates.
            </p>
          ) : (
            <div className="border border-border">
              <Table>
                <THead>
                  <TH>handle</TH>
                  <TH>amount</TH>
                  <TH>earlier</TH>
                  <TH>later</TH>
                  <TH>gap</TH>
                  <TH>earlier tx</TH>
                  <TH>later tx</TH>
                  <TH>remove later</TH>
                </THead>
                <TBody>
                  {manualDupes.map((d) => (
                    <TR key={`${d.earlier.id}-${d.later.id}`}>
                      <TD className="font-mono">
                        @{handleOf.get(d.earlier.clipper_id) ?? "—"}
                      </TD>
                      <TD className="num">{fmtUsd(d.earlier.amount)}</TD>
                      <TD className="font-mono text-xs text-text-2">
                        {fmtRelative(d.earlier.paid_at)}
                      </TD>
                      <TD className="font-mono text-xs text-text-2">
                        {fmtRelative(d.later.paid_at)}
                      </TD>
                      <TD className="font-mono text-xs">
                        {d.gapHours < 24
                          ? `${d.gapHours.toFixed(1)}h`
                          : `${(d.gapHours / 24).toFixed(1)}d`}
                      </TD>
                      <TD className="font-mono text-xs text-text-2 max-w-[140px] truncate">
                        {d.earlier.tx_hash ?? "—"}
                      </TD>
                      <TD className="font-mono text-xs text-text-2 max-w-[140px] truncate">
                        {d.later.tx_hash ?? "—"}
                      </TD>
                      <TD>
                        <DeletePayoutButton
                          payoutId={d.later.id}
                          handle={handleOf.get(d.later.clipper_id) ?? "—"}
                          amount={d.later.amount}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h3 className="label">
              unexplained overpay by clipper ({overpayRows.length})
            </h3>
            <span className="font-mono text-xs text-text-2">
              total unexplained: <span className="text-admin">{usd(totalUnexplainedCents)}</span>
            </span>
          </div>
          <p className="font-mono text-[10px] text-text-3 uppercase tracking-widest">
            paid − earned − in-flight &gt; ${(UNEXPLAINED_CENT_THRESHOLD / 100).toFixed(2)}. these clippers
            were paid more than the system can account for, even crediting all current in-flight value.
          </p>
          {overpayRows.length === 0 ? (
            <p className="font-mono text-xs text-text-3">
              none — every clipper&apos;s paid total is explained by earned + in-flight.
            </p>
          ) : (
            <div className="border border-border">
              <Table>
                <THead>
                  <TH>handle</TH>
                  <TH>payouts</TH>
                  <TH>paid</TH>
                  <TH>earned</TH>
                  <TH>in-flight</TH>
                  <TH>gap (paid−earned)</TH>
                  <TH>unexplained</TH>
                  <TH />
                </THead>
                <TBody>
                  {overpayRows.map((r) => (
                    <TR key={r.clipperId}>
                      <TD className="font-mono">
                        <Link
                          href={`/admin/clippers/${r.clipperId}` as never}
                          className="hover:underline"
                        >
                          @{r.handle}
                        </Link>
                      </TD>
                      <TD className="num">{r.payoutCount}</TD>
                      <TD className="num">{usd(r.paidCents)}</TD>
                      <TD className="num">{usd(r.earnedCents)}</TD>
                      <TD className="num text-text-2">
                        {r.inFlightCents > 0 ? `~${usd(r.inFlightCents)}` : "—"}
                      </TD>
                      <TD className="num">{usd(r.gapCents)}</TD>
                      <TD className="num text-admin">{usd(r.unexplainedCents)}</TD>
                      <TD>
                        <Link
                          href={`/admin/clippers/${r.clipperId}` as never}
                          className="font-mono text-[10px] uppercase tracking-widest text-admin hover:underline"
                        >
                          review →
                        </Link>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
