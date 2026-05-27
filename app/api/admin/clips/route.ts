import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Programmatic, machine-to-machine read API for the deliverable-tracking app.
// Auth is a static bearer secret (CLIPS_API_KEY) rather than an admin cookie
// session, since this is called server-to-server from another service.
// Accepts a `partner` filter (slug or label, case-insensitive) via query
// string (GET) or JSON body (GET/POST). Returns one row per clip with the
// fields the tracker needs: handle, submission date, tweet link, creator,
// partner.

type ClipRow = {
  handle: string | null;
  submission_date: string;
  tweet_link: string;
  creator: string | null;
  partner: string | null;
};

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}

async function handle(req: Request): Promise<NextResponse> {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const partnerFilter = await readPartner(req);
  const admin = createSupabaseAdminClient();

  // Load every creator/partner tag up front so we can both resolve the
  // requested partner and label the assignments on each clip.
  const { data: tagsRaw, error: tagsErr } = await admin
    .from("clip_tags")
    .select("id, slug, label, kind")
    .in("kind", ["creator", "partner"]);
  if (tagsErr) {
    return NextResponse.json({ error: tagsErr.message }, { status: 500 });
  }
  const tags = tagsRaw ?? [];
  const tagById = new Map(tags.map((t) => [t.id, t]));

  let resolvedPartner: { id: string; label: string } | null = null;
  if (partnerFilter) {
    const needle = partnerFilter.trim().toLowerCase();
    const match = tags.find(
      (t) =>
        t.kind === "partner" &&
        (t.slug.toLowerCase() === needle || t.label.toLowerCase() === needle),
    );
    if (!match) {
      return NextResponse.json(
        {
          error: "unknown partner",
          partner: partnerFilter,
          available_partners: tags
            .filter((t) => t.kind === "partner")
            .map((t) => ({ slug: t.slug, label: t.label })),
        },
        { status: 404 },
      );
    }
    resolvedPartner = { id: match.id, label: match.label };
  }

  // When filtering by partner, restrict to the clips carrying that tag.
  let clipIdFilter: string[] | null = null;
  if (resolvedPartner) {
    const { data: assigned, error } = await admin
      .from("clip_tag_assignments")
      .select("clip_id")
      .eq("tag_id", resolvedPartner.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    clipIdFilter = (assigned ?? []).map((a) => a.clip_id);
    if (clipIdFilter.length === 0) {
      return NextResponse.json({
        partner: resolvedPartner.label,
        count: 0,
        clips: [],
      });
    }
  }

  let clipQuery = admin
    .from("clips")
    .select("id, url, submitted_at, clipper:clippers(x_handle)")
    .order("submitted_at", { ascending: false });
  if (clipIdFilter) clipQuery = clipQuery.in("id", clipIdFilter);

  const { data: clips, error: clipsErr } = await clipQuery.limit(2000);
  if (clipsErr) {
    return NextResponse.json({ error: clipsErr.message }, { status: 500 });
  }

  const clipIds = (clips ?? []).map((c) => c.id);
  const creatorByClip = new Map<string, string[]>();
  const partnerByClip = new Map<string, string[]>();
  if (clipIds.length) {
    const { data: assignments, error } = await admin
      .from("clip_tag_assignments")
      .select("clip_id, tag_id")
      .in("clip_id", clipIds);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    for (const a of assignments ?? []) {
      const tag = tagById.get(a.tag_id);
      if (!tag) continue;
      const target = tag.kind === "creator" ? creatorByClip : partnerByClip;
      const cur = target.get(a.clip_id) ?? [];
      cur.push(tag.label);
      target.set(a.clip_id, cur);
    }
  }

  const rows: ClipRow[] = (clips ?? []).map((c) => {
    const clipper = (c as { clipper?: { x_handle?: string } | null }).clipper;
    const creators = creatorByClip.get(c.id) ?? [];
    const partners = partnerByClip.get(c.id) ?? [];
    return {
      handle: clipper?.x_handle ?? null,
      submission_date: c.submitted_at,
      tweet_link: c.url,
      creator: creators.length ? creators.join(", ") : null,
      partner: partners.length ? partners.join(", ") : null,
    };
  });

  return NextResponse.json({
    partner: resolvedPartner?.label ?? null,
    count: rows.length,
    clips: rows,
  });
}

async function readPartner(req: Request): Promise<string | null> {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("partner");
  if (fromQuery && fromQuery.trim()) return fromQuery;

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as
      | { partner?: unknown }
      | null;
    if (body && typeof body.partner === "string" && body.partner.trim()) {
      return body.partner;
    }
  }
  return null;
}

function authorize(req: Request): boolean {
  const key = process.env.CLIPS_API_KEY;
  if (!key) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${key}`) return true;
  return req.headers.get("x-api-key") === key;
}
