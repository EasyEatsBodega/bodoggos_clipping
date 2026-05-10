import { NextResponse } from "next/server";
import { createAdminSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

// Create a new admin: provisions a Supabase auth user with the supplied
// email + temporary password, then inserts an admin_users row pointing
// at the new auth.users.id. The new admin should change their password
// after signing in via the self-service password form.
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = createAdminSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase().trim();

  // Don't double-provision. If the email already exists in auth.users
  // (e.g. they were a clipper first) just upsert the admin_users row.
  const { data: existingList } = await auth.admin.auth.admin.listUsers();
  const existing = existingList.users.find(
    (u) => (u.email ?? "").toLowerCase() === email,
  );

  let authUserId: string;
  if (existing) {
    authUserId = existing.id;
    // Reset the password so the new admin can sign in with the value
    // the existing admin just typed.
    const { error: updErr } = await auth.admin.auth.admin.updateUserById(
      authUserId,
      { password: parsed.data.password },
    );
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  } else {
    const { data: created, error: createErr } =
      await auth.admin.auth.admin.createUser({
        email,
        password: parsed.data.password,
        email_confirm: true,
      });
    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "failed to create auth user" },
        { status: 500 },
      );
    }
    authUserId = created.user.id;
  }

  const { error: insErr } = await auth.admin.from("admin_users").upsert(
    { id: authUserId, email },
    { onConflict: "id" },
  );
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: authUserId, email });
}
