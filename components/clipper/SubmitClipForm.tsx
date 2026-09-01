"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export type CreatorOption = { id: string; label: string };

export function SubmitClipForm({
  campaignId,
  campaignName,
  creators = [],
  allowExternalAuthors = false,
}: {
  campaignId: string;
  campaignName: string;
  creators?: CreatorOption[];
  allowExternalAuthors?: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [creatorTagId, setCreatorTagId] = useState("");
  const [state, setState] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const needsCreator = creators.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setError(null);
    setOk(null);
    const res = await fetch("/api/clips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        campaign_id: campaignId,
        ...(creatorTagId ? { creator_tag_id: creatorTagId } : {}),
      }),
    });
    const json = await res.json();
    setState("idle");
    if (!res.ok) {
      setError(json.error ?? "Submission failed");
      return;
    }
    setOk("Clip accepted. Tracking begins now.");
    setUrl("");
    setCreatorTagId("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border border-border p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="label">submit clip · {campaignName}</span>
        <span className="font-mono text-[10px] text-text-3">
          {allowExternalAuthors
            ? "paste an x.com / status / id link — any account"
            : "paste an x.com / status / id link from your handle"}
        </span>
      </div>
      <div className="flex flex-wrap gap-3">
        <input
          required
          className="input-bare flex-1 min-w-[260px]"
          placeholder={
            allowExternalAuthors
              ? "https://x.com/anyaccount/status/1234567890"
              : "https://x.com/yourhandle/status/1234567890"
          }
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        {needsCreator && (
          <select
            required
            value={creatorTagId}
            onChange={(e) => setCreatorTagId(e.target.value)}
            className="input-bare font-mono text-sm bg-transparent border border-border px-3 py-2 min-w-[180px]"
            aria-label="Whose stream is this clip from?"
          >
            <option value="" disabled>
              whose stream?
            </option>
            {creators.map((c) => (
              <option key={c.id} value={c.id} className="bg-bg text-text">
                {c.label}
              </option>
            ))}
          </select>
        )}
        <Button
          variant="primary"
          type="submit"
          disabled={state === "submitting" || !url || (needsCreator && !creatorTagId)}
        >
          {state === "submitting" ? "Verifying…" : "Submit"}
        </Button>
      </div>
      {error && <p className="font-mono text-xs text-danger">{error}</p>}
      {ok && <p className="font-mono text-xs text-accent">{ok}</p>}
    </form>
  );
}
