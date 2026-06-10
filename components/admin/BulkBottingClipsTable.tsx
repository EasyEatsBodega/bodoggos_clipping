"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { fmtInt, fmtRelative, fmtUsd } from "@/lib/format";
import { BottingButton } from "@/components/admin/BottingButton";
import { FlagButton } from "@/components/admin/FlagButton";
import { RejectClipButton } from "@/components/admin/RejectClipButton";
import { DeleteClipButton } from "@/components/admin/DeleteClipButton";

// Clips table with checkboxes for bulk-marking botting. Rows that are
// already marked as botting are still shown (so admins can see history)
// but their checkbox is disabled — bulk-marking only applies to clips
// that aren't already excluded.

export type ClipRow = {
  id: string;
  url: string;
  submitted_at: string;
  status: "tracking" | "completed" | "rejected";
  impressions: number;
  final_impressions: number | null;
  payout_amount: string | null;
  botting_suspected: boolean;
  botting_reason: string | null;
  // Payment state derived from payout_clip_marks watermarks:
  //   "paid"         — completed, fully covered by a payout; nothing more accrues
  //   "paid_to_date" — covered up to the latest watermark but still tracking
  //   "due"          — earnings above the watermark not yet paid (due_amount set)
  //   null           — nothing to pay (rejected / botting / zero earnings)
  paid_state: "paid" | "paid_to_date" | "due" | null;
  due_amount: string | null;
};

export function BulkBottingClipsTable({
  clips,
  openFlagCountByClip,
}: {
  clips: ClipRow[];
  openFlagCountByClip: Record<string, number>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Only un-marked clips are eligible for bulk botting. Showing already-
  // marked clips in the table is fine but they don't take a checkbox.
  const eligible = useMemo(
    () => clips.filter((c) => !c.botting_suspected),
    [clips],
  );
  const eligibleIds = useMemo(
    () => new Set(eligible.map((c) => c.id)),
    [eligible],
  );
  const allEligibleSelected =
    eligible.length > 0 && eligible.every((c) => selected.has(c.id));
  const someSelected = selected.size > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allEligibleSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligible.map((c) => c.id)));
    }
  }

  async function submit() {
    if (selected.size === 0) return;
    const ids = Array.from(selected).filter((id) => eligibleIds.has(id));
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
    // Show a small success summary so the admin knows the action took.
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
    <div className="flex flex-col gap-3">
      <div className="border border-border">
        <Table>
          <THead>
            <TH>
              <input
                type="checkbox"
                checked={allEligibleSelected}
                onChange={toggleAll}
                disabled={eligible.length === 0 || busy}
                aria-label="Select all unmarked clips"
                className="cursor-pointer"
              />
            </TH>
            <TH>tweet</TH>
            <TH>submitted</TH>
            <TH>impressions</TH>
            <TH>earned</TH>
            <TH>paid</TH>
            <TH>status</TH>
            <TH />
            <TH />
            <TH />
            <TH />
          </THead>
          <TBody>
            {clips.map((c) => {
              const fc = openFlagCountByClip[c.id] ?? 0;
              const checkable = !c.botting_suspected;
              return (
                <TR key={c.id}>
                  <TD>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      disabled={!checkable || busy}
                      aria-label={checkable ? "Select clip" : "Already marked"}
                      className={checkable ? "cursor-pointer" : "cursor-not-allowed opacity-30"}
                    />
                  </TD>
                  <TD className="font-mono text-xs text-text-2 max-w-[260px] truncate">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {c.url}
                    </a>
                  </TD>
                  <TD className="font-mono text-xs text-text-2">{fmtRelative(c.submitted_at)}</TD>
                  <TD className="num">{fmtInt(c.final_impressions ?? c.impressions)}</TD>
                  <TD className="num">
                    {c.botting_suspected ? (
                      <span className="text-danger" title={c.botting_reason ?? ""}>
                        excluded
                      </span>
                    ) : c.payout_amount ? (
                      fmtUsd(c.payout_amount)
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="font-mono text-[10px] uppercase tracking-widest">
                    {c.paid_state === "paid" ? (
                      <span className="text-accent" title="fully covered by a payout; nothing more accrues">
                        paid ✓
                      </span>
                    ) : c.paid_state === "paid_to_date" ? (
                      <span className="text-text-2" title="covered up to the last payout; still tracking and accruing">
                        paid to date
                      </span>
                    ) : c.paid_state === "due" ? (
                      <span className="text-admin" title="earned above the last payout watermark; unpaid">
                        due {c.due_amount ?? ""}
                      </span>
                    ) : (
                      <span className="text-text-3">—</span>
                    )}
                  </TD>
                  <TD className="font-mono text-[10px] uppercase tracking-widest">
                    {c.status}
                    {fc > 0 && (
                      <span className="ml-2 text-admin" title={`${fc} open flag${fc === 1 ? "" : "s"}`}>
                        ⚑{fc > 1 ? fc : ""}
                      </span>
                    )}
                    {c.botting_suspected && (
                      <span
                        className="ml-2 text-danger"
                        title={c.botting_reason ?? "suspected engagement farming"}
                      >
                        botting
                      </span>
                    )}
                  </TD>
                  <TD>
                    <BottingButton
                      clipId={c.id}
                      suspected={c.botting_suspected}
                      currentReason={c.botting_reason}
                    />
                  </TD>
                  <TD>
                    <FlagButton target="clip" id={c.id} flagged={fc > 0} />
                  </TD>
                  <TD>
                    <RejectClipButton clipId={c.id} status={c.status} />
                  </TD>
                  <TD>
                    <DeleteClipButton clipId={c.id} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </div>

      {someSelected && (
        <div className="sticky bottom-4 z-10 self-end">
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
    </div>
  );
}
