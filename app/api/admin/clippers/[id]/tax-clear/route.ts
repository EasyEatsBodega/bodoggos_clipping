import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { adminTaxClearSchema } from "@/lib/validators";
import { currentTaxYear } from "@/lib/tax-compliance";

// POST: clear a clipper for payment for the current tax year.
// Two paths:
//   - No body: requires the clipper to have already submitted their info
//     via the platform's magic-link flow. Just marks cleared.
//   - JSON body with legal_first_name / legal_last_name / country (and
//     optional email): admin-override. Inserts a tax_info row using the
//     supplied details (collected off-platform) and immediately marks it
//     cleared. Used when an admin has the info via DM / email / signed
//     form and wants to record + clear in one shot.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const year = currentTaxYear();
  const now = new Date().toISOString();

  const { data: row } = await auth.admin
    .from("clipper_tax_info")
    .select("clipper_id")
    .eq("clipper_id", id)
    .eq("tax_year", year)
    .maybeSingle();

  if (row) {
    // Existing row — just mark cleared (ignore any body).
    const { error } = await auth.admin
      .from("clipper_tax_info")
      .update({ cleared_at: now, cleared_by: auth.user.id })
      .eq("clipper_id", id)
      .eq("tax_year", year);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // No row → admin-override path. Require legal info in the body.
  const body = await req.json().catch(() => null);
  const parsed = adminTaxClearSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "clipper hasn't submitted tax info; to override, POST { legal_first_name, legal_last_name, country, email? }",
      },
      { status: 400 },
    );
  }

  // Fall back to the clipper's account email if admin didn't supply one.
  let email = parsed.data.email;
  if (!email) {
    const { data: clipper } = await auth.admin
      .from("clippers")
      .select("email")
      .eq("id", id)
      .maybeSingle();
    email = clipper?.email ?? "";
  }

  const { error } = await auth.admin.from("clipper_tax_info").insert({
    clipper_id: id,
    tax_year: year,
    legal_first_name: parsed.data.legal_first_name,
    legal_last_name: parsed.data.legal_last_name,
    country: parsed.data.country,
    email,
    submitted_at: now,
    cleared_at: now,
    cleared_by: auth.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, admin_override: true });
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
