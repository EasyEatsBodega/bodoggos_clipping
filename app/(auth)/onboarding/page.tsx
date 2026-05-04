"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function OnboardingPage() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string>();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError(undefined);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ x_handle: handle.replace(/^@/, "") }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Something went wrong");
      setState("error");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header crumbs={[{ label: "FLICK CLIPPING", href: "/" }, { label: "ONBOARDING" }]} />
      <main className="flex-1 max-w-[1400px] mx-auto px-6 py-20 w-full">
        <div className="max-w-md">
          <p className="label mb-6">onboarding / x handle</p>
          <h1 className="font-serif text-4xl mb-2">Link your X handle.</h1>
          <p className="text-text-2 mb-8 text-sm">
            Posts you submit must come from this handle. It can&apos;t be changed later.
          </p>
          <form onSubmit={submit} className="flex flex-col gap-6">
            <Input
              id="handle"
              label="X handle"
              required
              autoFocus
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@yourhandle"
              maxLength={16}
            />
            <Button variant="primary" type="submit" disabled={state === "saving"}>
              {state === "saving" ? "Saving…" : "Continue"}
            </Button>
            {error && <p className="font-mono text-xs text-danger">{error}</p>}
          </form>
        </div>
      </main>
    </div>
  );
}
