"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Lets a clipper flip the sponsored disclosure on one of their own clips
// after submission (people forget the checkbox). Optimistic: reverts and
// shows the server's error if the save fails.
export function SponsoredToggle({
  clipId,
  initialSponsored,
}: {
  clipId: string;
  initialSponsored: boolean;
}) {
  const router = useRouter();
  const [sponsored, setSponsored] = useState(initialSponsored);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    const prev = sponsored;
    setSponsored(next);
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/clips/${clipId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sponsored: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setSponsored(prev);
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed to update");
      return;
    }
    router.refresh();
  }

  return (
    <label className="flex items-start gap-2 font-mono text-xs border border-border px-4 py-3">
      <input
        type="checkbox"
        className="mt-[2px]"
        checked={sponsored}
        disabled={busy}
        onChange={(e) => toggle(e.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <span>sponsored post</span>
        <span className="text-text-3">
          tick if this is a paid / sponsored placement. it shows up as a tag on the clip
          for the team.
        </span>
        {error && <span className="text-danger">{error}</span>}
      </span>
    </label>
  );
}
