"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type Info = {
  legal_first_name: string | null;
  legal_last_name: string | null;
  country: string | null;
  email: string | null;
  submitted_at: string | null;
  cleared_at: string | null;
  requested_at: string | null;
} | null;

const day = (s: string) => new Date(s).toISOString().slice(0, 10);

// Admin-side tax compliance panel on the clipper detail page. Surfaces the
// $600 threshold status, lets an admin request tax info from the clipper, shows
// the submitted legal details, and clears / revokes payment for the tax year.
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

  const requested = info?.requested_at != null;
  const submitted = info?.submitted_at != null;
  const cleared = info?.cleared_at != null;

  async function act(path: string, method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/clippers/${clipperId}/${path}`, { method });
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
              <Button variant="ghost" disabled={busy} onClick={() => act("tax-clear", "DELETE")}>
                {busy ? "…" : "revoke clearance"}
              </Button>
            </div>
          ) : submitted ? (
            <Button variant="primary" disabled={busy} onClick={() => act("tax-clear", "POST")}>
              {busy ? "…" : "clear for payment"}
            </Button>
          ) : (
            <Button variant="ghost" disabled={busy} onClick={() => act("tax-request", "POST")}>
              {busy ? "…" : requested ? "re-send request" : "request tax info"}
            </Button>
          )}
        </div>

        {submitted ? (
          <div className="font-mono text-xs text-text-2 flex flex-col gap-1">
            <div>
              <span className="text-text-3">// legal name: </span>
              {info!.legal_first_name} {info!.legal_last_name}
            </div>
            <div>
              <span className="text-text-3">// country: </span>
              {info!.country}
            </div>
            <div>
              <span className="text-text-3">// send forms to: </span>
              <a href={`mailto:${info!.email}`} className="text-accent hover:underline">
                {info!.email}
              </a>
            </div>
            <div className="text-text-3">
              submitted {day(info!.submitted_at!)}
              {cleared && ` · cleared ${day(info!.cleared_at!)}`}
            </div>
          </div>
        ) : requested ? (
          <p className="font-mono text-xs text-admin">
            // requested {day(info!.requested_at!)} — waiting on the clipper to submit their
            details on their dashboard.
          </p>
        ) : thresholdReached ? (
          <p className="font-mono text-xs text-danger">
            // payments on hold — waiting on the clipper to submit legal name + country.
          </p>
        ) : (
          <p className="font-mono text-xs text-text-3">
            // under $600 this year — no tax info required yet. Use “request tax info” to ask
            them to submit early.
          </p>
        )}
        {error && <p className="font-mono text-xs text-danger">{error}</p>}
      </div>
    </section>
  );
}
