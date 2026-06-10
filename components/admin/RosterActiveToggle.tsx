"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Inline roster-status toggle for the clippers list. Inactive clippers can
// still sign in but can't submit new clips; existing clips keep paying out.
export function RosterActiveToggle({
  clipperId,
  handle,
  initial,
}: {
  clipperId: string;
  handle: string;
  initial: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !active;
    if (
      !next &&
      !window.confirm(
        `Deactivate @${handle}?\n\nThey can still sign in and see their history, but NEW clip submissions will be rejected. Existing clips keep tracking and paying out.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/clippers/${clipperId}/active`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed");
      return;
    }
    setActive(next);
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={
        active
          ? "Deactivate — reject their new clip submissions"
          : "Reactivate — allow new clip submissions again"
      }
      className="font-mono text-[10px] uppercase tracking-widest text-text-3 hover:text-text hover:underline disabled:opacity-50"
    >
      {busy ? "…" : active ? "deactivate" : "activate"}
    </button>
  );
}
