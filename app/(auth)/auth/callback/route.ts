import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/", url.origin));
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/?auth_error=1", url.origin));
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/", url.origin));

  // First-time check: route to onboarding if no clippers row yet.
  const { data: clipper } = await supabase
    .from("clippers")
    .select("id, banned")
    .eq("id", user.id)
    .maybeSingle();

  if (clipper?.banned) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/suspended", url.origin));
  }
  if (!clipper) {
    return NextResponse.redirect(new URL("/onboarding", url.origin));
  }

  // Admin?
  const { data: admin } = await supabase
    .from("admin_users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.redirect(new URL(admin ? "/admin" : "/dashboard", url.origin));
}
