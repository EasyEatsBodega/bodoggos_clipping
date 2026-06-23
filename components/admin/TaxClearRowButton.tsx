"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TaxComplianceState } from "@/lib/queries";

// Compact clear / revoke action for the admin tax compliance table.
// "needs_submission" rows also support an admin-override path: collect the
// clipper's legal info off-platform (DM, email, signed form) and record +
// clear in one shot via three quick prompts.
export function TaxClearRowButton({
  clipperId,
  handle,
  state,
}: {
  clipperId: string;
  handle?: string;
  state: TaxComplianceState;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(method: "POST" | "DELETE", body?: unknown) {
    setBusy(true);
    const res = await fetch(`/api/admin/clippers/${clipperId}/tax-clear`, {
      method,
      ...(body
        ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed");
      return;
    }
    router.refresh();
  }

  async function adminOverrideClear() {
    const who = handle ? `@${handle}` : "this clipper";
    const first = window.prompt(
      `Admin-override clear ${who} for tax payments.\n\nLegal first name (as on their tax form):`,
      "",
    );
    if (!first || !first.trim()) return;
    const last = window.prompt("Legal last name:", "");
    if (!last || !last.trim()) return;
    const country = window.prompt("Country (ISO name, e.g. United States):", "");
    if (!country || !country.trim()) return;
    const email = window.prompt(
      "Tax-forms email (leave blank to use the clipper's account email):",
      "",
    );
    await act("POST", {
      legal_first_name: first.trim(),
      legal_last_name: last.trim(),
      country: country.trim(),
      ...(email && email.trim() ? { email: email.trim() } : {}),
    });
  }

  if (state === "needs_submission") {
    return (
      <button
        onClick={adminOverrideClear}
        disabled={busy}
        title="Clipper hasn't submitted info via the platform. Record the info you have off-channel and mark them cleared."
        className="font-mono text-[10px] uppercase tracking-widest text-admin hover:underline disabled:opacity-50"
      >
        {busy ? "…" : "record + clear"}
      </button>
    );
  }
  if (state === "cleared") {
    return (
      <button
        onClick={() => act("DELETE")}
        disabled={busy}
        className="font-mono text-[10px] uppercase tracking-widest text-text-3 hover:text-danger disabled:opacity-50"
      >
        {busy ? "…" : "revoke"}
      </button>
    );
  }
  return (
    <button
      onClick={() => act("POST")}
      disabled={busy}
      className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline disabled:opacity-50"
    >
      {busy ? "…" : "clear for payment"}
    </button>
  );
}
