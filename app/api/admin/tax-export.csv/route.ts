import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { toCsv } from "@/lib/csv";
import { getTaxComplianceRows } from "@/lib/queries";
import { currentTaxYear } from "@/lib/tax-compliance";

const STATE_LABEL = {
  needs_submission: "needs submission",
  awaiting_clearance: "awaiting clearance",
  cleared: "cleared",
} as const;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const year = currentTaxYear();
  const taxRows = await getTaxComplianceRows(auth.admin, year);

  const rows = taxRows.map((r) => ({
    x_handle: r.xHandle,
    account_email: r.accountEmail,
    status: STATE_LABEL[r.state],
    [`earned_${year}`]: (r.earnedCents / 100).toFixed(2),
    legal_name: r.legalName ?? "",
    country: r.country ?? "",
    tax_form_email: r.taxEmail ?? "",
    submitted_at: r.submittedAt ?? "",
    cleared_at: r.clearedAt ?? "",
  }));

  const csv = toCsv(rows, [
    "x_handle",
    "account_email",
    "status",
    `earned_${year}`,
    "legal_name",
    "country",
    "tax_form_email",
    "submitted_at",
    "cleared_at",
  ]);

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tax-compliance-${year}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
