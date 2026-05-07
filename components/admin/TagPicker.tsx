"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClipTag } from "@/lib/db-types";

export function TagPicker({
  clipId,
  allTags,
  initialTagIds,
}: {
  clipId: string;
  allTags: ClipTag[];
  initialTagIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialTagIds));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function save(next: Set<string>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/clips/${clipId}/tags`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tag_ids: Array.from(next) }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed");
      return;
    }
    router.refresh();
  }

  function toggle(tagId: string) {
    const next = new Set(selected);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    setSelected(next);
    save(next);
  }

  const selectedTags = allTags.filter((t) => selected.has(t.id));

  return (
    <div className="relative inline-flex flex-wrap items-center gap-1" ref={ref}>
      {selectedTags.map((t) => (
        <span
          key={t.id}
          className="font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 border border-admin/40 text-admin"
        >
          {t.label}
        </span>
      ))}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="font-mono text-[10px] uppercase tracking-widest text-text-3 hover:text-text disabled:opacity-50"
      >
        {selectedTags.length === 0 ? "+ tag" : "edit"}
      </button>
      {open && (
        <div
          className="absolute z-20 top-full left-0 mt-1 min-w-[180px] border border-border bg-bg p-2 flex flex-col gap-1 shadow-lg"
          style={{ background: "var(--bg)" }}
        >
          {allTags.length === 0 && (
            <span className="font-mono text-[10px] text-text-3">no tags yet</span>
          )}
          {allTags.map((t) => (
            <label
              key={t.id}
              className="font-mono text-[11px] flex items-center gap-2 cursor-pointer hover:text-admin"
            >
              <input
                type="checkbox"
                checked={selected.has(t.id)}
                onChange={() => toggle(t.id)}
                disabled={busy}
              />
              <span>{t.label}</span>
            </label>
          ))}
          {error && (
            <span className="font-mono text-[10px] text-danger mt-1">{error}</span>
          )}
        </div>
      )}
    </div>
  );
}
