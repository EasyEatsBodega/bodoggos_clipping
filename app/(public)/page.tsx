import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const { data: admin } = await supabase
      .from("admin_users")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();
    redirect(admin ? "/admin" : "/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header crumbs={[{ label: "FLICK CLIPPING" }]} />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-20 w-full">
        <div className="max-w-2xl">
          <p className="label mb-6">campaign / open</p>
          <h1 className="font-serif text-6xl leading-[1.05] mb-10">
            Post a clip. <em>Track impressions.</em> Get paid in USDC.
          </h1>
          <div className="flex flex-wrap gap-3">
            <Link href={"/api/auth/x/start" as never} className="btn btn-primary">
              Continue with X
            </Link>
            <Link href={"/auth/magic" as never} className="btn btn-ghost">
              Magic link via email
            </Link>
            <Link href={"/auth/admin" as never} className="btn btn-ghost">
              Admin sign in
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
