"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClipTag } from "@/lib/db-types";

export function TagPicker({
  clipId,
  allTags,
  initialTagIds,
  kind,
}: {
  clipId: string;
  allTags: ClipTag[];
  initialTagIds: string[];
  // If set, the picker only displays/edits tags of that kind and the
  // server-side save preserves tags of other kinds. If unset, the picker
  // shows both sections in a single dropdown and replaces all tags.
  kind?: "topic" | "creator";
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
      body: JSON.stringify({ tag_ids: Array.from(next), kind }),
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

  // When scoped to a kind, only show that kind's tags. When unscoped, show
  // both grouped sections.
  const visibleTags = kind ? allTags.filter((t) => t.kind === kind) : allTags;
  const selectedTags = visibleTags.filter((t) => selected.has(t.id));
  const topicTags = allTags.filter((t) => t.kind !== "creator");
  const creatorTags = allTags.filter((t) => t.kind === "creator");
  const addLabel = kind === "creator" ? "+ creator" : kind === "topic" ? "+ topic" : "+ tag";

  return (
    <div className="relative inline-flex flex-wrap items-center gap-1" ref={ref}>
      {selectedTags.map((t) => (
        <span
          key={t.id}
          className={`font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 border ${
            t.kind === "creator"
              ? "border-accent/40 text-accent"
              : "border-admin/40 text-admin"
          }`}
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
        {selectedTags.length === 0 ? addLabel : "edit"}
      </button>
      {open && (
        <div
          className="absolute z-20 top-full left-0 mt-1 min-w-[200px] border border-border bg-bg p-2 flex flex-col gap-2 shadow-lg"
          style={{ background: "var(--bg)" }}
        >
          {visibleTags.length === 0 && (
            <span className="font-mono text-[10px] text-text-3">no tags yet</span>
          )}
          {kind === "creator" ? (
            <Section
              title="creator"
              tags={creatorTags}
              selected={selected}
              busy={busy}
              onToggle={toggle}
            />
          ) : kind === "topic" ? (
            <Section
              title="topic"
              tags={topicTags}
              selected={selected}
              busy={busy}
              onToggle={toggle}
            />
          ) : (
            <>
              <Section
                title="creator"
                tags={creatorTags}
                selected={selected}
                busy={busy}
                onToggle={toggle}
              />
              <Section
                title="topic"
                tags={topicTags}
                selected={selected}
                busy={busy}
                onToggle={toggle}
              />
            </>
          )}
          {error && (
            <span className="font-mono text-[10px] text-danger mt-1">{error}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  tags,
  selected,
  busy,
  onToggle,
}: {
  title: string;
  tags: ClipTag[];
  selected: Set<string>;
  busy: boolean;
  onToggle: (id: string) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-widest text-text-3">
        {title}
      </span>
      {tags.map((t) => (
        <label
          key={t.id}
          className="font-mono text-[11px] flex items-center gap-2 cursor-pointer hover:text-admin"
        >
          <input
            type="checkbox"
            checked={selected.has(t.id)}
            onChange={() => onToggle(t.id)}
            disabled={busy}
          />
          <span>{t.label}</span>
        </label>
      ))}
    </div>
  );
}
