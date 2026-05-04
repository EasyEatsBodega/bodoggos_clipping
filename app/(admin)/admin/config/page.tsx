import { Header } from "@/components/Header";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ConfigForm } from "@/components/admin/ConfigForm";

export const dynamic = "force-dynamic";

export default async function AdminConfigPage() {
  const admin = createSupabaseAdminClient();
  const { data: campaign } = await admin
    .from("campaigns")
    .select("*")
    .eq("active", true)
    .maybeSingle();

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/admin" }, { label: "CONFIG" }]}
        accent="admin"
        showLogout
      />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-6">
        <h1 className="label">campaign config</h1>
        <p className="font-mono text-xs text-text-2 max-w-xl">
          Changes apply only to clips submitted <em>after</em> the change. Clips already in flight
          keep the rate and cap snapshotted at submit time.
        </p>
        {campaign ? (
          <ConfigForm campaign={campaign} />
        ) : (
          <p className="font-mono text-sm text-danger">No active campaign found. Run seed.sql.</p>
        )}
      </main>
    </div>
  );
}
