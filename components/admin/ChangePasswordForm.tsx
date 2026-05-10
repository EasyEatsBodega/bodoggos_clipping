"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Self-service password change. Uses the browser session directly so we
// don't need a server endpoint — supabase.auth.updateUser updates the
// currently signed-in user.
export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (password !== confirm) {
      setError("passwords don't match");
      return;
    }
    if (password.length < 8) {
      setError("password must be at least 8 characters");
      return;
    }
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error: updErr } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setOk(true);
    setPassword("");
    setConfirm("");
  }

  return (
    <form onSubmit={submit} className="border border-border p-5 flex flex-col gap-4">
      <span className="label">change your password</span>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          id="new-password"
          label="new password (min 8 chars)"
          required
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          id="confirm-password"
          label="confirm new password"
          required
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <div className="flex items-end">
          <Button
            variant="primary"
            type="submit"
            disabled={busy || password.length < 8 || password !== confirm}
          >
            {busy ? "Updating…" : "Update password"}
          </Button>
        </div>
      </div>
      {error && <span className="font-mono text-xs text-danger">{error}</span>}
      {ok && <span className="font-mono text-xs text-accent">✓ password updated</span>}
    </form>
  );
}
