"use client";

import { useState } from "react";
import { Header } from "@/components/Header";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function MagicLinkPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string>();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(undefined);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setState("error");
      return;
    }
    setState("sent");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header crumbs={[{ label: "FLICK CLIPPING", href: "/" }, { label: "MAGIC LINK" }]} />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-20 w-full">
        <div className="max-w-md">
          <p className="label mb-6">auth / magic link</p>
          <h1 className="font-serif text-4xl mb-8">Sign in with email.</h1>

          {state === "sent" ? (
            <p className="font-mono text-sm text-text-2">
              Sent. Check your inbox for a link from us.
            </p>
          ) : (
            <form onSubmit={send} className="flex flex-col gap-6">
              <Input
                id="email"
                label="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@domain.com"
              />
              <Button variant="primary" type="submit" disabled={state === "sending"}>
                {state === "sending" ? "Sending…" : "Send link"}
              </Button>
              {error && <p className="font-mono text-xs text-danger">{error}</p>}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
