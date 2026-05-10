"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function CreateAdminForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed");
      return;
    }
    setOk(`Added ${email}. Share the temporary password — they should change it after signing in.`);
    setEmail("");
    setPassword("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border border-border p-5 flex flex-col gap-4">
      <span className="label">add admin</span>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          id="new-admin-email"
          label="email"
          required
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="new-admin@domain.com"
        />
        <Input
          id="new-admin-password"
          label="temporary password (min 8 chars)"
          required
          type="text"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="they will change this after signing in"
        />
        <div className="flex items-end">
          <Button
            variant="primary"
            type="submit"
            disabled={busy || !email || password.length < 8}
          >
            {busy ? "Adding…" : "Add admin"}
          </Button>
        </div>
      </div>
      {error && <span className="font-mono text-xs text-danger">{error}</span>}
      {ok && <span className="font-mono text-xs text-accent">{ok}</span>}
    </form>
  );
}
