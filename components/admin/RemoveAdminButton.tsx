"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RemoveAdminButton({
  adminId,
  email,
  isSelf,
}: {
  adminId: string;
  email: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (isSelf) return;
    if (!confirm(`Remove admin access for ${email}? Their account will stay but they'll lose access to /admin.`)) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/admins/${adminId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed to remove admin");
      return;
    }
    router.refresh();
  }

  if (isSelf) {
    return (
      <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
        you
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="font-mono text-[10px] uppercase tracking-widest text-danger hover:underline disabled:opacity-50"
    >
      {busy ? "removing…" : "remove"}
    </button>
  );
}
