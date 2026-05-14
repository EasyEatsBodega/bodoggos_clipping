import Link from "next/link";
import { Table, THead, TH, TBody, TR, TD } from "@/components/ui/Table";
import { fmtCountdown, fmtInt, fmtRelative, fmtUsd } from "@/lib/format";
import type { Clip } from "@/lib/db-types";
import { DeleteClipButton } from "./DeleteClipButton";

export function ClipsTable({ clips }: { clips: Clip[] }) {
  if (!clips.length) {
    return (
      <div className="border border-border p-10 text-center text-text-2 font-mono text-sm">
        No clips yet. Submit your first one above.
      </div>
    );
  }
  return (
    <div className="border border-border">
      <Table>
        <THead>
          <TH>tweet</TH>
          <TH>submitted</TH>
          <TH>impressions</TH>
          <TH>earned</TH>
          <TH>status</TH>
          <TH>window</TH>
          <TH />
          <TH />
        </THead>
        <TBody>
          {clips.map((c) => (
            <TR key={c.id}>
              <TD className="font-mono text-xs text-text-2 max-w-[260px]">
                <div className="truncate">{c.url}</div>
                {c.status === "rejected" && c.rejected_reason && (
                  <div className="text-danger text-[10px] mt-1 normal-case">
                    rejected: {c.rejected_reason}
                  </div>
                )}
                {c.botting_suspected && (
                  <div className="text-danger text-[10px] mt-1 normal-case">
                    flagged for review · not counted for payout
                  </div>
                )}
              </TD>
              <TD className="font-mono text-xs text-text-2">{fmtRelative(c.submitted_at)}</TD>
              <TD className="num">
                {fmtInt(c.final_impressions ?? c.impressions)}
              </TD>
              <TD className="num">
                {c.botting_suspected ? (
                  <span
                    className="text-danger font-mono text-[10px] uppercase tracking-widest"
                    title="flagged for review · not counted for payout"
                  >
                    excluded
                  </span>
                ) : c.payout_amount ? (
                  fmtUsd(c.payout_amount)
                ) : (
                  <span className="text-text-3">—</span>
                )}
              </TD>
              <TD>
                <StatusPill
                  status={c.status}
                  reason={c.rejected_reason}
                  flagged={c.botting_suspected}
                />
              </TD>
              <TD className="font-mono text-xs text-text-2">
                {c.status === "tracking" ? fmtCountdown(c.tracking_until) : "—"}
              </TD>
              <TD>
                <Link
                  href={`/dashboard/clips/${c.id}` as never}
                  className="font-mono text-[10px] uppercase tracking-widest text-accent hover:underline"
                >
                  detail →
                </Link>
              </TD>
              <TD>
                <DeleteClipButton clipId={c.id} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

function StatusPill({
  status,
  reason,
  flagged,
}: {
  status: Clip["status"];
  reason: string | null;
  flagged?: boolean;
}) {
  const cls =
    status === "tracking"
      ? "text-accent"
      : status === "completed"
      ? "text-text"
      : "text-danger";
  return (
    <div className="flex flex-col gap-1">
      <span className={`font-mono text-[10px] uppercase tracking-widest ${cls}`} title={reason ?? undefined}>
        {status}
      </span>
      {flagged && (
        <span
          className="font-mono text-[10px] uppercase tracking-widest text-danger"
          title="flagged for review · not counted for payout"
        >
          flagged
        </span>
      )}
    </div>
  );
}
