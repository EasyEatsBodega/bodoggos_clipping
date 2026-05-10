import { Header } from "@/components/Header";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fmtRelative } from "@/lib/format";
import { AdminNav } from "@/components/admin/AdminNav";
import { CreateAdminForm } from "@/components/admin/CreateAdminForm";
import { RemoveAdminButton } from "@/components/admin/RemoveAdminButton";
import { ChangePasswordForm } from "@/components/admin/ChangePasswordForm";
import { requireAdmin } from "@/lib/auth-helpers";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminAdminsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) notFound();

  const admin = createSupabaseAdminClient();
  const { data: admins } = await admin
    .from("admin_users")
    .select("id, email, created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "ADMINS" }]}
        accent="admin"
        showLogout
      />
      <AdminNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="label">your account</h2>
          <p className="font-mono text-xs text-text-2">
            signed in as <span className="text-text">{auth.user.email}</span>
          </p>
          <ChangePasswordForm />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="label">team</h2>
          <CreateAdminForm />

          <div className="border border-border">
            <Table>
              <THead>
                <TH>email</TH>
                <TH>added</TH>
                <TH />
              </THead>
              <TBody>
                {(admins ?? []).map((a) => (
                  <TR key={a.id}>
                    <TD className="font-mono">{a.email}</TD>
                    <TD className="font-mono text-xs text-text-2">
                      {fmtRelative(a.created_at)}
                    </TD>
                    <TD>
                      <RemoveAdminButton
                        adminId={a.id}
                        email={a.email}
                        isSelf={a.id === auth.user.id}
                      />
                    </TD>
                  </TR>
                ))}
                {(!admins || admins.length === 0) && (
                  <TR>
                    <TD className="text-text-3 font-mono text-sm">no admins yet</TD>
                    <TD /><TD />
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
          <p className="font-mono text-[10px] text-text-3 uppercase tracking-widest">
            * removing an admin revokes /admin access but does not delete the underlying account.
          </p>
        </section>
      </main>
    </div>
  );
}
