import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WalletForm } from "@/components/clipper/WalletForm";
import { ClipperNav } from "@/components/clipper/ClipperNav";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/");

  const { data: clipper } = await supabase
    .from("clippers")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!clipper) redirect("/onboarding");

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[
          { label: "FLICK CLIPPING", href: "/dashboard" },
          { label: "SETTINGS" },
        ]}
        showLogout
      />
      <ClipperNav />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-10 w-full flex flex-col gap-6">
        <h1 className="label">account</h1>
        <Field label="email" value={clipper.email} />
        <Field label="x handle" value={`@${clipper.x_handle}`} hint="locked at signup" />
        <Field label="auth method" value={clipper.auth_method} />
        <Field label="joined" value={new Date(clipper.joined_at).toISOString().slice(0, 10)} />

        <h2 className="label mt-4">payments</h2>
        <WalletForm initial={clipper.solana_wallet ?? null} />
      </main>
    </div>
  );
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-b border-border py-4 grid grid-cols-3 gap-6">
      <span className="label">{label}</span>
      <span className="font-mono text-sm col-span-2 flex items-center gap-3">
        {value}
        {hint && <span className="text-text-3 text-xs">// {hint}</span>}
      </span>
    </div>
  );
}
