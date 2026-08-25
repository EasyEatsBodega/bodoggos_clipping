import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { toCsv } from "@/lib/csv";
import { fetchAllPages } from "@/lib/queries";

// Accountant-facing payout ledger: one row per recorded payment with the
// recipient's identity (handle + legal name/country where tax info was
// collected), the USD amount, and the on-chain reference (tx hash +
// Solscan link) so every row is independently verifiable. Ordered oldest
// first, which is how bookkeepers reconcile. Optional ?year=YYYY filters
// to a calendar year (UTC).
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(req.url);
  const yearParam = url.searchParams.get("year");
  const year = yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null;

  const [payouts, clippers, taxInfos] = await Promise.all([
    fetchAllPages<{
      id: string;
      clipper_id: string;
      amount: string;
      chain: string;
      tx_hash: string | null;
      paid_at: string;
      note: string | null;
    }>((from, to) =>
      auth.admin
        .from("payouts")
        .select("id, clipper_id, amount, chain, tx_hash, paid_at, note")
        .order("paid_at", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{ id: string; x_handle: string; email: string }>((from, to) =>
      auth.admin
        .from("clippers")
        .select("id, x_handle, email")
        .order("id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<{
      clipper_id: string;
      tax_year: number;
      legal_first_name: string;
      legal_last_name: string;
      country: string;
      email: string | null;
    }>((from, to) =>
      auth.admin
        .from("clipper_tax_info")
        .select("clipper_id, tax_year, legal_first_name, legal_last_name, country, email")
        .order("clipper_id", { ascending: true })
        .range(from, to),
    ),
  ]);

  const clipperOf = new Map(clippers.map((c) => [c.id, c]));
  // Prefer the tax info filed for the payout's own year; fall back to the
  // most recent year we have for that clipper.
  const taxByClipperYear = new Map<string, (typeof taxInfos)[number]>();
  const latestTaxByClipper = new Map<string, (typeof taxInfos)[number]>();
  for (const t of taxInfos) {
    taxByClipperYear.set(`${t.clipper_id}:${t.tax_year}`, t);
    const cur = latestTaxByClipper.get(t.clipper_id);
    if (!cur || t.tax_year > cur.tax_year) latestTaxByClipper.set(t.clipper_id, t);
  }

  const filtered = year
    ? payouts.filter((p) => new Date(p.paid_at).getUTCFullYear() === year)
    : payouts;

  const rows = filtered.map((p) => {
    const clipper = clipperOf.get(p.clipper_id);
    const payoutYear = new Date(p.paid_at).getUTCFullYear();
    const tax =
      taxByClipperYear.get(`${p.clipper_id}:${payoutYear}`) ??
      latestTaxByClipper.get(p.clipper_id) ??
      null;
    return {
      date: p.paid_at.slice(0, 10),
      paid_at_utc: p.paid_at,
      handle: clipper ? `@${clipper.x_handle}` : "",
      legal_name: tax ? `${tax.legal_first_name} ${tax.legal_last_name}` : "",
      country: tax?.country ?? "",
      recipient_email: tax?.email || clipper?.email || "",
      amount_usd: Number(p.amount).toFixed(2),
      currency: "USDC",
      chain: p.chain,
      tx_hash: p.tx_hash ?? "",
      tx_url:
        p.tx_hash && p.chain.toLowerCase() === "solana"
          ? `https://solscan.io/tx/${p.tx_hash}`
          : "",
      note: p.note ?? "",
      payout_id: p.id,
    };
  });

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
