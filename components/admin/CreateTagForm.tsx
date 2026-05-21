"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function CreateTagForm() {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<"topic" | "creator" | "partner">("topic");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function autoSlug(v: string) {
    setLabel(v);
    if (slug === "" || slug === defaultSlug(label)) {
      setSlug(defaultSlug(v));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: slug || defaultSlug(label), label, kind }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed");
      return;
    }
    setLabel("");
    setSlug("");
    setKind("topic");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="border border-border p-5 flex flex-col gap-4">
      <span className="label">add tag</span>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Input
          id="tag-label"
          label="label"
          required
          value={label}
          onChange={(e) => autoSlug(e.target.value)}
          placeholder="e.g. Interview"
        />
        <Input
          id="tag-slug"
          label="slug (url-safe)"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="e.g. interview"
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="tag-kind"
            className="font-mono text-[10px] uppercase tracking-widest text-text-3"
          >
            kind
          </label>
          <select
            id="tag-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "topic" | "creator" | "partner")}
            className="font-mono text-sm px-3 py-2 border border-border bg-transparent"
          >
            <option value="topic">topic</option>
            <option value="creator">creator</option>
            <option value="partner">partner</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button variant="primary" type="submit" disabled={busy || !label}>
            {busy ? "Adding…" : "Add tag"}
          </Button>
        </div>
      </div>
      {error && <span className="font-mono text-xs text-danger">{error}</span>}
    </form>
  );
}

function defaultSlug(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
