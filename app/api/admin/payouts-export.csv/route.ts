import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { toCsv } from "@/lib/csv";
import { getPayoutLedger } from "@/lib/queries";

// Accountant-facing payout ledger as CSV: one row per recorded payment with
// the recipient, USD amount, and on-chain reference (tx hash + Solscan link)
// so every row is independently verifiable. Optional ?year=YYYY filters to a
// calendar year (UTC).
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const yearParam = url.searchParams.get("year");
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;

  const { rows: ledger } = await getPayoutLedger(auth.admin, year);

  const rows = ledger.map((p) => ({
    date: p.paidAt.slice(0, 10),
    paid_at_utc: p.paidAt,
    handle: p.handle ? `@${p.handle}` : "",
    legal_name: p.legalName ?? "",
    country: p.country ?? "",
    recipient_email: p.recipientEmail ?? "",
    amount_usd: Number(p.amount).toFixed(2),
    currency: "USDC",
    chain: p.chain,
    tx_hash: p.txHash ?? "",
    tx_url: p.txUrl ?? "",
    note: p.note ?? "",
    payout_id: p.payoutId,
  }));

  const csv = toCsv(rows, [
    "date",
    "paid_at_utc",
    "handle",
    "legal_name",
    "country",
    "recipient_email",
    "amount_usd",
    "currency",
    "chain",
    "tx_hash",
    "tx_url",
    "note",
    "payout_id",
  ]);

  const suffix = year ? `-${year}` : "";
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="payouts${suffix}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
