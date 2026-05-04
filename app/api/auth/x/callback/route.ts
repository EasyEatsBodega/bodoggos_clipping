import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { exchangeCodeForToken, getMe } from "@/lib/x-oauth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("x_oauth_state")?.value;
  const verifier = cookieStore.get("x_oauth_verifier")?.value;

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return NextResponse.redirect(new URL("/?auth_error=x_state", url.origin));
  }

  const clientId = process.env.X_OAUTH_CLIENT_ID!;
  const clientSecret = process.env.X_OAUTH_CLIENT_SECRET!;
  const redirectUri = process.env.X_OAUTH_REDIRECT_URI!;

  let tokens;
  try {
    tokens = await exchangeCodeForToken({ code, verifier, clientId, clientSecret, redirectUri });
  } catch {
    return NextResponse.redirect(new URL("/?auth_error=x_exchange", url.origin));
  }

  let me;
  try {
    me = await getMe(tokens.access_token);
  } catch {
    return NextResponse.redirect(new URL("/?auth_error=x_me", url.origin));
  }

  const handle = me.username.toLowerCase();
  const xUserId = me.id;

  const admin = createSupabaseAdminClient();

  // Find existing clipper by x_user_id (preferred) or x_handle
  const { data: byUserId } = await admin
    .from("clippers")
    .select("*")
    .eq("x_user_id", xUserId)
    .maybeSingle();
  const existing = byUserId
    ? byUserId
    : (
        await admin.from("clippers").select("*").eq("x_handle", handle).maybeSingle()
      ).data;

  // Find or create the auth.users row to sign them into.
  const syntheticEmail = `${xUserId}@x-clipper.local`;
  const email = existing?.email ?? syntheticEmail;

  // Upsert auth user. We use admin.createUser; if exists, we ignore the conflict.
  let authUserId: string | null = null;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { x_user_id: xUserId, x_handle: handle },
  });
  if (created?.user) {
    authUserId = created.user.id;
  } else if (createErr) {
    // Try to find by email
    const { data: list } = await admin.auth.admin.listUsers();
    const found = list?.users.find((u) => u.email === email);
    if (found) authUserId = found.id;
  }
  if (!authUserId) {
    return NextResponse.redirect(new URL("/?auth_error=x_user", url.origin));
  }

  // Reconcile clippers row
  if (!existing) {
    await admin.from("clippers").insert({
      id: authUserId,
      email,
      x_handle: handle,
      x_user_id: xUserId,
      auth_method: "x_oauth",
    });
  } else {
    // OAuth wins for handle ownership: update x_user_id, switch auth_method
    if (existing.id !== authUserId) {
      // Different auth user owns this row — keep the existing clipper id but update fields.
      await admin
        .from("clippers")
        .update({ x_user_id: xUserId, auth_method: "x_oauth" })
        .eq("id", existing.id);
    } else if (!existing.x_user_id || existing.x_user_id !== xUserId) {
      await admin
        .from("clippers")
        .update({ x_user_id: xUserId, auth_method: "x_oauth" })
        .eq("id", existing.id);
    }
  }

  // Bridge into Supabase session via magic link generation
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData?.properties?.action_link) {
    return NextResponse.redirect(new URL("/?auth_error=x_link", url.origin));
  }
  const action = new URL(linkData.properties.action_link);
  const token_hash = action.searchParams.get("token_hash");
  if (!token_hash) {
    return NextResponse.redirect(new URL("/?auth_error=x_token_hash", url.origin));
  }

  // Build the redirect response first so the SSR client can write Supabase
  // session cookies directly onto it. Cookies set via next/headers cookies()
  // do not reliably propagate to a freshly constructed NextResponse.
  const res = NextResponse.redirect(new URL("/dashboard", url.origin));
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (items: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          for (const { name, value, options } of items) {
            res.cookies.set(name, value, options as never);
          }
        },
      },
    },
  );
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash,
  });
  if (verifyErr) {
    return NextResponse.redirect(new URL("/?auth_error=x_verify", url.origin));
  }

  res.cookies.delete("x_oauth_state");
  res.cookies.delete("x_oauth_verifier");
  return res;
}
