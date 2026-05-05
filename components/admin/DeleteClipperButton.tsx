"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteClipperButton({
  clipperId,
  handle,
}: {
  clipperId: string;
  handle: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    const typed = window.prompt(
      `Permanently delete @${handle} and ALL their clips? This removes their impressions from totals and cannot be undone.\n\nType the handle to confirm:`,
    );
    if (typed == null) return;
    if (typed.trim().toLowerCase() !== handle.toLowerCase()) {
      alert("Handle did not match. Aborted.");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/clippers/${clipperId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Failed");
      return;
    }
    router.replace("/admin/clippers");
  }

  return (
    <button
      onClick={del}
      disabled={busy}
      className="btn btn-ghost text-danger disabled:opacity-50"
      style={{ borderColor: "var(--danger)" }}
    >
      {busy ? "Deleting…" : "Delete clipper"}
    </button>
  );
}
