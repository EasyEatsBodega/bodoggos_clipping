import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { taxInfoSchema } from "@/lib/validators";
import { currentTaxYear } from "@/lib/tax-compliance";

// Clipper submits their legal name + country for the current tax year. Writes
// go through the service role so the clipper can never touch cleared_at.
// Resubmitting before clearance just updates the details; the admin clears
// separately once the off-platform forms are done.
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = taxInfoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "invalid request" },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();
  const year = currentTaxYear();

  // Don't clobber an existing clearance for this year.
  const { data: existing } = await admin
    .from("clipper_tax_info")
    .select("cleared_at")
    .eq("clipper_id", user.id)
    .eq("tax_year", year)
    .maybeSingle();
  if (existing?.cleared_at) {
    return NextResponse.json({ ok: true, already_cleared: true });
  }

  const { error } = await admin.from("clipper_tax_info").upsert(
    {
      clipper_id: user.id,
      tax_year: year,
      legal_first_name: parsed.data.legal_first_name,
      legal_last_name: parsed.data.legal_last_name,
      country: parsed.data.country,
      email: parsed.data.email,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "clipper_id,tax_year" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
