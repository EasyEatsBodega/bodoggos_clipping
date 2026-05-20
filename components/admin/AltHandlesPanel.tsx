"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AltHandle = {
  id: string;
  x_handle: string;
  note: string | null;
  added_at: string;
};

export function AltHandlesPanel({
  clipperId,
  primaryHandle,
  handles,
}: {
  clipperId: string;
  primaryHandle: string;
  handles: AltHandle[];
}) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const clean = handle.trim().replace(/^@/, "");
    if (!clean) return;
    setBusy(true);
    const res = await fetch(`/api/admin/clippers/${clipperId}/alt-handles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ x_handle: clean, note: note.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "failed to add handle");
      return;
    }
    setHandle("");
    setNote("");
    router.refresh();
  }

  async function remove(handleId: string) {
    if (!window.confirm("Remove this whitelisted handle?")) return;
    const res = await fetch(
      `/api/admin/clippers/${clipperId}/alt-handles/${handleId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "failed to remove");
      return;
    }
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="label">whitelisted X handles</h2>
      <p className="font-mono text-xs text-text-2">
        clips from these handles are accepted as if posted by{" "}
        <span className="text-text">@{primaryHandle}</span> (the clipper's
        primary handle).
      </p>

      <div className="border border-border divide-y divide-border">
        {handles.length === 0 && (
          <div className="px-4 py-3 font-mono text-xs text-text-3">
            no alternate handles whitelisted yet.
          </div>
        )}
        {handles.map((h) => (
          <div
            key={h.id}
            className="px-4 py-3 flex items-center justify-between gap-4"
          >
            <div className="flex flex-col gap-1">
              <span className="font-mono text-sm text-text">@{h.x_handle}</span>
              {h.note && (
                <span className="font-mono text-[10px] text-text-3">// {h.note}</span>
              )}
            </div>
            <button
              onClick={() => remove(h.id)}
              className="font-mono text-[10px] uppercase tracking-widest text-danger hover:underline"
            >
              remove
            </button>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
            handle
          </span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="alt_handle"
            className="font-mono text-sm px-3 py-2 border border-border bg-transparent w-44"
          />
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-3">
            note (optional)
          </span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="why is this account whitelisted?"
            className="font-mono text-sm px-3 py-2 border border-border bg-transparent w-full"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !handle.trim()}
          className="font-mono text-[10px] uppercase tracking-widest px-4 py-2 border border-border hover:border-admin disabled:opacity-50"
        >
          {busy ? "adding…" : "whitelist handle"}
        </button>
      </form>
      {err && (
        <p className="font-mono text-xs text-danger">// {err}</p>
      )}
    </section>
  );
}
