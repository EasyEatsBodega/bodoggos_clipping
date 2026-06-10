"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Bulk-dismiss for clip flags, composable into the server-rendered
// /admin/flags table (same pattern as BulkBottingSelect). Selecting one or
// more open flags shows a sticky action bar; dismissing prompts once for an
// optional resolution note and resolves them all in a single call.

type Ctx = {
  selected: Set<string>;
  busy: boolean;
  toggle: (id: string) => void;
  setAll: (ids: string[], on: boolean) => void;
};

const FlagCtx = createContext<Ctx | null>(null);

export function BulkFlagResolveProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const value = useMemo<Ctx>(
    () => ({
      selected,
      busy,
      toggle: (id) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      setAll: (ids, on) =>
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of ids) {
            if (on) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
    }),
    [selected, busy],
  );

  async function dismiss() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const resolution = window.prompt(
      `Dismiss ${ids.length} flag${ids.length === 1 ? "" : "s"} as reviewed / not botting?\n\nOptional note (stored as the resolution):`,
      "false positive — reviewed, not botting",
    );
    if (resolution === null) return; // cancelled

    setBusy(true);
    const res = await fetch("/api/admin/flags/bulk-resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ flag_ids: ids, resolution: resolution.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Bulk dismiss failed");
      return;
    }
    const j = (await res.json().catch(() => ({}))) as { resolved?: number };
    setSelected(new Set());
    router.refresh();
    alert(`Dismissed ${j.resolved ?? ids.length} flag${(j.resolved ?? ids.length) === 1 ? "" : "s"}.`);
  }

  return (
    <FlagCtx.Provider value={value}>
      {children}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <div className="border border-accent bg-bg px-4 py-3 flex items-center gap-4 shadow-lg">
            <span className="font-mono text-xs text-text">
              <span className="text-accent">{selected.size}</span> flag{selected.size === 1 ? "" : "s"} selected
            </span>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={busy}
              className="font-mono text-[10px] uppercase tracking-widest text-text-2 hover:text-text disabled:opacity-50"
            >
              clear
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy}
              className="font-mono text-[10px] uppercase tracking-widest px-3 py-2 border border-accent text-accent hover:bg-accent hover:text-bg disabled:opacity-50"
            >
              {busy ? "dismissing…" : "dismiss selected (not botting)"}
            </button>
          </div>
        </div>
      )}
    </FlagCtx.Provider>
  );
}

function useBulkFlags(): Ctx {
  const ctx = useContext(FlagCtx);
  if (!ctx) throw new Error("BulkFlagResolve components must be inside BulkFlagResolveProvider");
  return ctx;
}

export function BulkFlagCheckbox({
  flagId,
  disabled,
}: {
  flagId: string;
  disabled?: boolean;
}) {
  const { selected, busy, toggle } = useBulkFlags();
  const checkable = !disabled;
  return (
    <input
      type="checkbox"
      checked={selected.has(flagId)}
      onChange={() => toggle(flagId)}
      disabled={!checkable || busy}
      aria-label={checkable ? "Select flag" : "Already resolved"}
      className={checkable ? "cursor-pointer" : "cursor-not-allowed opacity-30"}
    />
  );
}

export function BulkFlagSelectAll({ ids }: { ids: string[] }) {
  const { selected, busy, setAll } = useBulkFlags();
  const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
  return (
    <input
      type="checkbox"
      checked={allOn}
      onChange={() => setAll(ids, !allOn)}
      disabled={ids.length === 0 || busy}
      aria-label="Select all open flags"
      className="cursor-pointer"
    />
  );
}
