import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { currentTaxYear } from "@/lib/tax-compliance";

// Admin asks a clipper to submit their tax info for the current year. Creates
// (or stamps) the row with requested_at so the submission form shows on the
// clipper's dashboard even if they're under the $600 threshold. Leaves any
// already-submitted details intact.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const year = currentTaxYear();

  const { error } = await auth.admin.from("clipper_tax_info").upsert(
    {
      clipper_id: id,
      tax_year: year,
      requested_at: new Date().toISOString(),
      requested_by: auth.user.id,
    },
    { onConflict: "clipper_id,tax_year" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
