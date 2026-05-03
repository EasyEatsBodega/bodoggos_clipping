import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { onboardingSchema } from "@/lib/validators";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid handle" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user || !user.email) {
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  const handle = parsed.data.x_handle.toLowerCase();

  // Use service-role to bypass RLS for the insert (the row's id == user.id).
  const admin = createSupabaseAdminClient();

  // Reject if a clipper row already exists for this user.
  const existing = await admin.from("clippers").select("id").eq("id", user.id).maybeSingle();
  if (existing.data) {
    return NextResponse.json({ error: "already onboarded" }, { status: 409 });
  }

  // Reject if the handle is taken.
  const taken = await admin
    .from("clippers")
    .select("id")
    .eq("x_handle", handle)
    .maybeSingle();
  if (taken.data) {
    return NextResponse.json({ error: "handle is already taken" }, { status: 409 });
  }

  const { error } = await admin.from("clippers").insert({
    id: user.id,
    email: user.email,
    x_handle: handle,
    auth_method: "magic_link",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
