"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function SubmitClipForm({
  campaignId,
  campaignName,
}: {
  campaignId: string;
  campaignName: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setError(null);
    setOk(null);
    const res = await fetch("/api/clips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, campaign_id: campaignId }),
    });
    const json = await res.json();
    setState("idle");
    if (!res.ok) {
      setError(json.error ?? "Submission failed");
      return;
    }
    setOk("Clip accepted. Tracking begins now.");
    setUrl("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border border-border p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="label">submit clip · {campaignName}</span>
        <span className="font-mono text-[10px] text-text-3">
          paste an x.com / status / id link from your handle
        </span>
      </div>
      <div className="flex gap-3">
        <input
          required
          className="input-bare flex-1"
          placeholder="https://x.com/yourhandle/status/1234567890"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button variant="primary" type="submit" disabled={state === "submitting" || !url}>
          {state === "submitting" ? "Verifying…" : "Submit"}
        </Button>
      </div>
      {error && <p className="font-mono text-xs text-danger">{error}</p>}
      {ok && <p className="font-mono text-xs text-accent">{ok}</p>}
    </form>
  );
}
