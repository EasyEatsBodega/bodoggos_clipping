"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type Info = {
  legal_first_name: string;
  legal_last_name: string;
  country: string;
  email: string;
  submitted_at: string;
  cleared_at: string | null;
} | null;

// Admin-side tax compliance panel on the clipper detail page. Surfaces the
// $600 threshold status, the clipper's submitted legal info, and the clear /
// revoke action that unlocks payment for the tax year.
export function TaxClearPanel({
  clipperId,
  taxYear,
  earnedUsd,
  thresholdReached,
  info,
}: {
  clipperId: string;
  taxYear: number;
  earnedUsd: string;
  thresholdReached: boolean;
  info: Info;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleared = info?.cleared_at != null;

  async function act(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/clippers/${clipperId}/tax-clear`, { method });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed");
      return;
    }
    router.refresh();
  }

  const accent = cleared ? "var(--accent)" : thresholdReached ? "var(--danger)" : "var(--border)";

  return (
    <section className="flex flex-col gap-3">
      <h2 className="label">tax compliance · {taxYear}</h2>
      <div className="border p-4 flex flex-col gap-3" style={{ borderColor: accent }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-xs text-text-2">
            <span className="text-text-3">// earned {taxYear}: </span>
            <span className="text-text">${earnedUsd}</span>
            <span className="text-text-3"> · $600 threshold </span>
            {thresholdReached ? (
              <span className="text-danger">reached</span>
            ) : (
              <span className="text-text-2">not reached</span>
            )}
          </p>
          {cleared ? (
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
                cleared for payment
              </span>
              <Button variant="ghost" disabled={busy} onClick={() => act("DELETE")}>
                {busy ? "…" : "revoke clearance"}
              </Button>
            </div>
          ) : info ? (
            <Button variant="primary" disabled={busy} onClick={() => act("POST")}>
              {busy ? "…" : "clear for payment"}
            </Button>
          ) : null}
        </div>

        {info ? (
          <div className="font-mono text-xs text-text-2 flex flex-col gap-1">
            <div>
              <span className="text-text-3">// legal name: </span>
              {info.legal_first_name} {info.legal_last_name}
            </div>
            <div>
              <span className="text-text-3">// country: </span>
              {info.country}
            </div>
            <div>
              <span className="text-text-3">// send forms to: </span>
              <a href={`mailto:${info.email}`} className="text-accent hover:underline">
                {info.email}
              </a>
            </div>
            <div className="text-text-3">
              submitted {new Date(info.submitted_at).toISOString().slice(0, 10)}
              {cleared &&
                ` · cleared ${new Date(info.cleared_at!).toISOString().slice(0, 10)}`}
            </div>
          </div>
        ) : thresholdReached ? (
          <p className="font-mono text-xs text-danger">
            // payments on hold — waiting on the clipper to submit legal name + country.
          </p>
        ) : (
          <p className="font-mono text-xs text-text-3">
            // under $600 this year — no tax info required yet.
          </p>
        )}
      </div>
    </section>
  );
}
