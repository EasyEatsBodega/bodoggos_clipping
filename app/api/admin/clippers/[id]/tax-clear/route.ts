import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { currentTaxYear } from "@/lib/tax-compliance";

// POST: clear a clipper for payment for the current tax year (after their
// off-platform tax forms are completed). Requires they've submitted their
// info first.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const year = currentTaxYear();

  const { data: row } = await auth.admin
    .from("clipper_tax_info")
    .select("clipper_id")
    .eq("clipper_id", id)
    .eq("tax_year", year)
    .maybeSingle();
  if (!row) {
    return NextResponse.json(
      { error: "clipper hasn't submitted tax info for this year yet" },
      { status: 400 },
    );
  }

  const { error } = await auth.admin
    .from("clipper_tax_info")
    .update({ cleared_at: new Date().toISOString(), cleared_by: auth.user.id })
    .eq("clipper_id", id)
    .eq("tax_year", year);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE: revoke clearance for the current tax year (re-hold payments).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const year = currentTaxYear();

  const { error } = await auth.admin
    .from("clipper_tax_info")
    .update({ cleared_at: null, cleared_by: null })
    .eq("clipper_id", id)
    .eq("tax_year", year);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
