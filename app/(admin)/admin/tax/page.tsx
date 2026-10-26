import Link from "next/link";
import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtUsd } from "@/lib/format";
import { AdminNav } from "@/components/admin/AdminNav";
import { TaxClearRowButton } from "@/components/admin/TaxClearRowButton";
import {
  getPayoutLedger,
  getTaxComplianceRows,
  type TaxComplianceState,
} from "@/lib/queries";
import { currentTaxYear } from "@/lib/tax-compliance";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<TaxComplianceState, string> = {
  needs_submission: "needs submission",
  awaiting_clearance: "awaiting clearance",
  cleared: "cleared",
};

const STATE_COLOR: Record<TaxComplianceState, string> = {
  needs_submission: "var(--danger)",
  awaiting_clearance: "var(--admin)",
  cleared: "var(--accent)",
};

const fmtDate = (s: string | null) => (s ? new Date(s).toISOString().slice(0, 10) : "—");
const fmtDateTimeUtc = (s: string) => new Date(s).toISOString().slice(0, 16).replace("T", " ");

export default async function AdminTaxPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const thisYear = currentTaxYear();
  const year = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : thisYear;
  const admin = createSupabaseAdminClient();
  const [rows, ledger] = await Promise.all([
    getTaxComplianceRows(admin, year),
    getPayoutLedger(admin, year),
  ]);
  const txns = ledger.rows;
  const years = [...new Set([thisYear, year, ...ledger.years])].sort((a, b) => b - a);
  const txnTotalCents = txns.reduce((sum, t) => sum + Math.round(Number(t.amount) * 100), 0);
  const txnRecipients = new Set(txns.map((t) => t.clipperId)).size;

  const needs = rows.filter((r) => r.state === "needs_submission").length;
  const awaiting = rows.filter((r) => r.state === "awaiting_clearance").length;
  const cleared = rows.filter((r) => r.state === "cleared").length;

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "TAX" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="label">tax compliance · {year}</h1>
            <p className="font-mono text-xs text-text-2 mt-1">
              clippers who reached the $600 threshold in {year}.{" "}
              <span className="text-danger">{needs} need submission</span> ·{" "}
              <span className="text-admin">{awaiting} awaiting clearance</span> ·{" "}
              <span className="text-accent">{cleared} cleared</span>
            </p>
          </div>
          <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest">
            {years.map((y) => (
              <Link
                key={y}
                href={`/admin/tax?year=${y}` as never}
                className={y === year ? "text-text" : "text-text-3 hover:underline"}
              >
                {y}
              </Link>
            ))}
            <a href={`/api/admin/tax-export.csv?year=${year}`} className="text-admin hover:underline">
              export csv ↓
            </a>
          </div>
        </div>

        <div className="border border-border">
          <Table>
            <THead>
              <TH>handle</TH>
              <TH>status</TH>
              <TH>earned {year}</TH>
              <TH>paid {year}</TH>
              <TH>legal name</TH>
              <TH>country</TH>
              <TH>send forms to</TH>
              <TH>submitted</TH>
              <TH>cleared</TH>
              <TH>action</TH>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.clipperId}>
                  <TD className="font-mono">
                    <Link
                      href={`/admin/clippers/${r.clipperId}` as never}
                      className="hover:underline"
                    >
                      @{r.xHandle}
                    </Link>
                  </TD>
                  <TD>
                    <span
                      className="font-mono text-[10px] uppercase tracking-widest"
                      style={{ color: STATE_COLOR[r.state] }}
                    >
                      {STATE_LABEL[r.state]}
                    </span>
                  </TD>
                  <TD className={`num ${r.earnedCents >= 60000 ? "text-admin" : "text-text-2"}`}>
                    <span title={r.earnedCents >= 60000 ? "≥ $600 by earnings" : undefined}>
                      {fmtUsd((r.earnedCents / 100).toFixed(2))}
                    </span>
                  </TD>
                  <TD className={`num ${r.paidCents >= 60000 ? "text-admin" : "text-text-2"}`}>
                    <span title={r.paidCents >= 60000 ? "≥ $600 by actual payments" : undefined}>
                      {fmtUsd((r.paidCents / 100).toFixed(2))}
                    </span>
                  </TD>
                  <TD className="font-mono text-xs text-text-2">{r.legalName ?? "—"}</TD>
                  <TD className="font-mono text-xs text-text-2">{r.country ?? "—"}</TD>
                  <TD className="font-mono text-xs">
                    {r.taxEmail ? (
                      <a href={`mailto:${r.taxEmail}`} className="text-accent hover:underline">
                        {r.taxEmail}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="font-mono text-xs text-text-2">{fmtDate(r.submittedAt)}</TD>
                  <TD className="font-mono text-xs text-text-2">{fmtDate(r.clearedAt)}</TD>
                  <TD>
                    <TaxClearRowButton
                      clipperId={r.clipperId}
                      handle={r.xHandle}
                      state={r.state}
                    />
                  </TD>
                </TR>
              ))}
              {rows.length === 0 && (
                <TR>
                  <TD className="text-text-3 font-mono text-sm">
                    no clippers reached the $600 threshold in {year}
                  </TD>
                  <TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD /><TD />
                </TR>
              )}
            </TBody>
          </Table>
        </div>

        <section className="flex flex-col gap-3 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="label">transactions · {year}</h2>
              <p className="font-mono text-xs text-text-2 mt-1">
                every payout recorded in {year} (UTC), oldest first. {txns.length} transactions ·{" "}
                {txnRecipients} recipients · {fmtUsd((txnTotalCents / 100).toFixed(2))} total
              </p>
            </div>
            <a
              href={`/api/admin/payouts-export.csv?year=${year}`}
              className="font-mono text-[10px] uppercase tracking-widest text-admin hover:underline"
            >
              export transactions csv ↓
            </a>
          </div>

          <div className="border border-border overflow-x-auto">
            <Table>
              <THead>
                <TH>date (utc)</TH>
                <TH>recipient</TH>
                <TH>legal name</TH>
                <TH>country</TH>
                <TH>amount</TH>
                <TH>chain</TH>
                <TH>tx hash</TH>
                <TH>note</TH>
              </THead>
              <TBody>
                {txns.map((t) => (
                  <TR key={t.payoutId}>
                    <TD className="font-mono text-xs text-text-2 whitespace-nowrap">
                      {fmtDateTimeUtc(t.paidAt)}
                    </TD>
                    <TD className="font-mono">
                      <Link
                        href={`/admin/clippers/${t.clipperId}` as never}
                        className="hover:underline"
                      >
                        {t.handle ? `@${t.handle}` : t.clipperId}
                      </Link>
                    </TD>
                    <TD className="font-mono text-xs text-text-2">{t.legalName ?? "—"}</TD>
                    <TD className="font-mono text-xs text-text-2">{t.country ?? "—"}</TD>
                    <TD className="num">{fmtUsd(t.amount)}</TD>
                    <TD className="font-mono text-xs">{t.chain}</TD>
                    <TD className="font-mono text-xs text-text-2 break-all min-w-[280px]">
                      {t.txHash ? (
                        t.txUrl ? (
                          <a
                            href={t.txUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent hover:underline"
                          >
                            {t.txHash}
                          </a>
                        ) : (
                          t.txHash
                        )
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="font-mono text-xs text-text-2">{t.note ?? "—"}</TD>
                  </TR>
                ))}
                {txns.length === 0 && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm">no payouts recorded in {year}</TD>
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
