"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// Bulk-select-for-botting as composable pieces, so a server-rendered table
// (like /admin/clips, which embeds TagPicker and other client widgets in
// server markup) can opt in without becoming a client component itself.
//
// Usage:
//   <BulkBottingProvider>
//     <Table>
//       <THead><TH><BulkBottingSelectAll ids={eligibleIds} /></TH>…</THead>
//       <TBody>…<TD><BulkBottingCheckbox clipId={id} disabled={…} /></TD>…</TBody>
//     </Table>
//   </BulkBottingProvider>
//
// The provider renders a sticky action bar whenever 1+ clips are selected.

type Ctx = {
  selected: Set<string>;
  busy: boolean;
  toggle: (id: string) => void;
  setAll: (ids: string[], on: boolean) => void;
};

const BulkCtx = createContext<Ctx | null>(null);

export function BulkBottingProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const ctx = useMemo<Ctx>(
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

  async function submit() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const reason = window.prompt(
      `Mark ${ids.length} clip${ids.length === 1 ? "" : "s"} as suspected engagement farming.\n\nReason (shown on the bot report sent to the clipper):`,
      "",
    );
    if (!reason || !reason.trim()) return;

    setBusy(true);
    const res = await fetch("/api/admin/clips/botting/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clip_ids: ids, reason: reason.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Bulk botting failed");
      return;
    }
    const j = (await res.json().catch(() => ({}))) as {
      marked?: number;
      flags_resolved?: number;
    };
    setSelected(new Set());
    router.refresh();
    alert(
      `Marked ${j.marked ?? ids.length} clip${(j.marked ?? ids.length) === 1 ? "" : "s"} as botting${
        j.flags_resolved ? ` and resolved ${j.flags_resolved} open flag${j.flags_resolved === 1 ? "" : "s"}` : ""
      }.`,
    );
  }

  // The innocent verdict: resolve every open flag on the selected clips
  // without touching botting state. Selected clips without flags are no-ops.
  async function clearFlags() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const resolution = window.prompt(
      `Clear all open flags on ${ids.length} selected clip${ids.length === 1 ? "" : "s"}?\n\nOptional note (stored as the resolution):`,
      "false positive — reviewed, not botting",
    );
    if (resolution === null) return; // cancelled

    setBusy(true);
    const res = await fetch("/api/admin/flags/bulk-resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clip_ids: ids, resolution: resolution.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Clearing flags failed");
      return;
    }
    const j = (await res.json().catch(() => ({}))) as { resolved?: number };
    setSelected(new Set());
    router.refresh();
    alert(`Cleared ${j.resolved ?? 0} open flag${(j.resolved ?? 0) === 1 ? "" : "s"}.`);
  }

  return (
    <BulkCtx.Provider value={ctx}>
      {children}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <div className="border border-admin bg-bg px-4 py-3 flex items-center gap-4 shadow-lg">
            <span className="font-mono text-xs text-text">
              <span className="text-admin">{selected.size}</span> selected
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
              onClick={clearFlags}
              disabled={busy}
              className="font-mono text-[10px] uppercase tracking-widest px-3 py-2 border border-accent text-accent hover:bg-accent hover:text-bg disabled:opacity-50"
            >
              {busy ? "working…" : "clear flags (not botting)"}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="font-mono text-[10px] uppercase tracking-widest px-3 py-2 border border-admin text-admin hover:bg-admin hover:text-bg disabled:opacity-50"
            >
              {busy ? "marking…" : "mark selected as botting"}
            </button>
          </div>
        </div>
      )}
    </BulkCtx.Provider>
  );
}

function useBulk(): Ctx {
  const ctx = useContext(BulkCtx);
  if (!ctx) throw new Error("BulkBotting components must be inside BulkBottingProvider");
  return ctx;
}

export function BulkBottingCheckbox({
  clipId,
  disabled,
}: {
  clipId: string;
  disabled?: boolean;
}) {
  const { selected, busy, toggle } = useBulk();
  const checkable = !disabled;
  return (
    <input
      type="checkbox"
      checked={selected.has(clipId)}
      onChange={() => toggle(clipId)}
      disabled={!checkable || busy}
      aria-label={checkable ? "Select clip" : "Already marked"}
      className={checkable ? "cursor-pointer" : "cursor-not-allowed opacity-30"}
    />
  );
}

export function BulkBottingSelectAll({ ids }: { ids: string[] }) {
  const { selected, busy, setAll } = useBulk();
  const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
  return (
    <input
      type="checkbox"
      checked={allOn}
      onChange={() => setAll(ids, !allOn)}
      disabled={ids.length === 0 || busy}
      aria-label="Select all unmarked clips"
      className="cursor-pointer"
    />
  );
}
