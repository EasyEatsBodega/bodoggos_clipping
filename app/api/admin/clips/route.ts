import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchAllPages } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Programmatic, machine-to-machine read API for the deliverable-tracking app.
// Auth is a static bearer secret (CLIPS_API_KEY) rather than an admin cookie
// session, since this is called server-to-server from another service.
//
// Filters (all optional; combined with AND):
//   - partner: slug or label of a partner tag, case-insensitive exact match.
//   - creator: substring matched against creator tag labels/slugs, case-insensitive.
//
// Either, both, or neither may be provided. Pass via query string (GET) or
// JSON body (GET/POST). Returns one row per non-rejected clip with the
// fields the tracker needs: handle, submission date, tweet link, creator,
// partner.

type ClipRow = {
  handle: string | null;
  submission_date: string;
  tweet_link: string;
  creator: string | null;
  partner: string | null;
  impressions: number;
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

  const { partner: partnerFilter, creator: creatorFilter } = await readFilters(req);
  const admin = createSupabaseAdminClient();

  // Load every creator/partner tag up front so we can both resolve the
  // requested filters and label the assignments on each clip.
  const { data: tagsRaw, error: tagsErr } = await admin
    .from("clip_tags")
    .select("id, slug, label, kind")
    .in("kind", ["creator", "partner"]);
  if (tagsErr) {
    return NextResponse.json({ error: tagsErr.message }, { status: 500 });
  }
  const tags = tagsRaw ?? [];
  const tagById = new Map(tags.map((t) => [t.id, t]));

  // Resolve partner (exact, case-insensitive, slug or label).
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

  // Resolve creator (substring, case-insensitive, label or slug). Any
  // creator tag whose label/slug contains the query contributes.
  let creatorMatches: { id: string; label: string }[] = [];
  if (creatorFilter) {
    const needle = creatorFilter.trim().toLowerCase();
    creatorMatches = tags
      .filter(
        (t) =>
          t.kind === "creator" &&
          (t.label.toLowerCase().includes(needle) ||
            t.slug.toLowerCase().includes(needle)),
      )
      .map((t) => ({ id: t.id, label: t.label }));
    if (creatorMatches.length === 0) {
      return NextResponse.json(
        {
          error: "no creators match",
          creator: creatorFilter,
          available_creators: tags
            .filter((t) => t.kind === "creator")
            .map((t) => ({ slug: t.slug, label: t.label })),
        },
        { status: 404 },
      );
    }
  }

  // Build the clip-id filter from each active dimension, then intersect.
  // Every clip_tag_assignments select must page — a popular partner alone
  // can have thousands of assignments and a naive query truncates at the
  // Postgrest row cap, silently hiding clips from the result.
  let partnerClipIds: Set<string> | null = null;
  if (resolvedPartner) {
    try {
      const rows = await fetchAllPages<{ clip_id: string }>((from, to) =>
        admin
          .from("clip_tag_assignments")
          .select("clip_id")
          .eq("tag_id", resolvedPartner!.id)
          .order("clip_id", { ascending: true })
          .range(from, to),
      );
      partnerClipIds = new Set(rows.map((a) => a.clip_id));
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  let creatorClipIds: Set<string> | null = null;
  if (creatorMatches.length > 0) {
    try {
      const tagIds = creatorMatches.map((t) => t.id);
      const rows = await fetchAllPages<{ clip_id: string }>((from, to) =>
        admin
          .from("clip_tag_assignments")
          .select("clip_id")
          .in("tag_id", tagIds)
          .order("clip_id", { ascending: true })
          .range(from, to),
      );
      creatorClipIds = new Set(rows.map((a) => a.clip_id));
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  let clipIdFilter: string[] | null = null;
  if (partnerClipIds && creatorClipIds) {
    clipIdFilter = [...partnerClipIds].filter((id) => creatorClipIds!.has(id));
  } else if (partnerClipIds) {
    clipIdFilter = [...partnerClipIds];
  } else if (creatorClipIds) {
    clipIdFilter = [...creatorClipIds];
  }

  if (clipIdFilter && clipIdFilter.length === 0) {
    return NextResponse.json({
      partner: resolvedPartner?.label ?? null,
      creator: creatorFilter ?? null,
      count: 0,
      clips: [],
    });
  }

  // Page the main clips query so projects with >1000 clips aren't silently
  // truncated. Stable order on submitted_at + id keeps pagination consistent.
  type ClipRecord = {
    id: string;
    url: string;
    submitted_at: string;
    impressions: number | null;
    final_impressions: number | null;
    clipper?: { x_handle?: string } | { x_handle?: string }[] | null;
  };
  let clips: ClipRecord[] = [];
  try {
    clips = await fetchAllPages<ClipRecord>((from, to) => {
      let q = admin
        .from("clips")
        .select(
          "id, url, submitted_at, impressions, final_impressions, clipper:clippers(x_handle)",
        )
        .neq("status", "rejected")
        .order("submitted_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);
      if (clipIdFilter) q = q.in("id", clipIdFilter);
      // Postgrest types the foreign-table select as an array; the runtime
      // value for a single-row relation is the object directly. Cast to
      // satisfy the helper signature.
      return q as unknown as PromiseLike<{
        data: ClipRecord[] | null;
        error: unknown;
      }>;
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }

  const clipIds = clips.map((c) => c.id);
  const creatorByClip = new Map<string, string[]>();
  const partnerByClip = new Map<string, string[]>();
  if (clipIds.length) {
    let assignments: Array<{ clip_id: string; tag_id: string }> = [];
    try {
      assignments = await fetchAllPages<{ clip_id: string; tag_id: string }>(
        (from, to) =>
          admin
            .from("clip_tag_assignments")
            .select("clip_id, tag_id")
            .in("clip_id", clipIds)
            .order("clip_id", { ascending: true })
            .range(from, to),
      );
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
    for (const a of assignments) {
      const tag = tagById.get(a.tag_id);
      if (!tag) continue;
      const target = tag.kind === "creator" ? creatorByClip : partnerByClip;
      const cur = target.get(a.clip_id) ?? [];
      cur.push(tag.label);
      target.set(a.clip_id, cur);
    }
  }

  const rows: ClipRow[] = clips.map((c) => {
    const creators = creatorByClip.get(c.id) ?? [];
    const partners = partnerByClip.get(c.id) ?? [];
    // final_impressions is the locked-in count for completed clips;
    // impressions is the latest poll while tracking. Match the admin UI.
    const views = Number(c.final_impressions ?? c.impressions ?? 0);
    const clipper = Array.isArray(c.clipper) ? c.clipper[0] : c.clipper;
    return {
      handle: clipper?.x_handle ?? null,
      submission_date: c.submitted_at,
      tweet_link: c.url,
      creator: creators.length ? creators.join(", ") : null,
      partner: partners.length ? partners.join(", ") : null,
      impressions: views,
    };
  });

  return NextResponse.json({
    partner: resolvedPartner?.label ?? null,
    creator: creatorFilter ?? null,
    count: rows.length,
    clips: rows,
  });
}

async function readFilters(
  req: Request,
): Promise<{ partner: string | null; creator: string | null }> {
  const url = new URL(req.url);
  let partner = url.searchParams.get("partner");
  let creator = url.searchParams.get("creator");

  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as
      | { partner?: unknown; creator?: unknown }
      | null;
    if (body) {
      if (!partner && typeof body.partner === "string") partner = body.partner;
      if (!creator && typeof body.creator === "string") creator = body.creator;
    }
  }

  return {
    partner: partner && partner.trim() ? partner : null,
    creator: creator && creator.trim() ? creator : null,
  };
}

function authorize(req: Request): boolean {
  const key = process.env.CLIPS_API_KEY;
  if (!key) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${key}`) return true;
  return req.headers.get("x-api-key") === key;
}
