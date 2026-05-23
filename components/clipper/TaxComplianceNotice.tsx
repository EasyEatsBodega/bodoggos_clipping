"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

// Shown on the clipper dashboard once they've earned $600+ in the tax year.
// "needs_submission": collect legal name + country. "awaiting_clearance":
// info received, payments paused pending admin verification.
export function TaxComplianceNotice({
  state,
  taxYear,
  defaultEmail = "",
  paymentHold = false,
}: {
  state: "needs_submission" | "awaiting_clearance";
  taxYear: number;
  defaultEmail?: string;
  paymentHold?: boolean;
}) {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state === "awaiting_clearance") {
    return (
      <div
        className="border px-4 py-3"
        style={{ borderColor: "var(--admin)", background: "rgba(255, 157, 89, 0.08)" }}
      >
        <p className="font-mono text-xs text-text-2">
          <span className="text-admin">// tax info received —</span> your payouts are paused
          while we verify your {taxYear} tax forms. We&apos;ll reach out with the forms to
          complete, then unlock payments.
        </p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/profile/tax-info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        legal_first_name: first,
        legal_last_name: last,
        country,
        email,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <div
      className="border px-4 py-4 flex flex-col gap-3"
      style={{ borderColor: "var(--danger)", background: "rgba(255, 89, 89, 0.08)" }}
    >
      <p className="font-mono text-xs text-text-2">
        <span className="text-danger">// tax info required —</span>{" "}
        {paymentHold
          ? `you've earned $600 or more in ${taxYear}, so we need your legal details and an email where we can send your tax forms. Payouts are paused until this is completed.`
          : `we need your legal details and an email on file for ${taxYear} tax forms. Please add them below so your payouts aren't held up later.`}
      </p>
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input
          id="tax-first"
          label="legal first name"
          required
          value={first}
          onChange={(e) => setFirst(e.target.value)}
        />
        <Input
          id="tax-last"
          label="legal last name"
          required
          value={last}
          onChange={(e) => setLast(e.target.value)}
        />
        <Input
          id="tax-country"
          label="country"
          required
          placeholder="United States"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
        <Input
          id="tax-email"
          label="email for tax forms"
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="md:col-span-3"
        />
        <div className="md:col-span-3 flex items-center gap-3">
          <Button
            variant="primary"
            type="submit"
            disabled={busy || !first || !last || !country || !email}
          >
            {busy ? "Submitting…" : "Submit tax info"}
          </Button>
          {error && <span className="font-mono text-xs text-danger">{error}</span>}
        </div>
      </form>
    </div>
  );
}
