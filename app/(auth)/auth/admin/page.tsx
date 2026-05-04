"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setError(undefined);
    const supabase = createSupabaseBrowserClient();

    const { data, error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInErr || !data.user) {
      setError(signInErr?.message ?? "Sign-in failed.");
      setState("error");
      return;
    }

    const { data: admin } = await supabase
      .from("admin_users")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!admin) {
      await supabase.auth.signOut();
      setError("That account is not an admin.");
      setState("error");
      return;
    }

    router.replace("/admin");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        crumbs={[{ label: "ADMIN.OPS", href: "/" }, { label: "SIGN IN" }]}
        accent="admin"
      />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-20 w-full">
        <div className="max-w-md">
          <p className="label mb-6">auth / admin</p>
          <h1 className="font-serif text-4xl mb-8">Admin sign in.</h1>
          <form onSubmit={submit} className="flex flex-col gap-6">
            <Input
              id="email"
              label="email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
            />
            <Input
              id="password"
              label="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button variant="primary" type="submit" disabled={state === "submitting"}>
              {state === "submitting" ? "Signing in…" : "Sign in"}
            </Button>
            {error && <p className="font-mono text-xs text-danger">{error}</p>}
          </form>
        </div>
      </main>
    </div>
  );
}
