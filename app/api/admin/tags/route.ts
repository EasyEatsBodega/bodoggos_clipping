import { NextResponse } from "next/server";
import { tagSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = tagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from("clip_tags")
    .insert({
      slug: parsed.data.slug,
      label: parsed.data.label,
      kind: parsed.data.kind ?? "topic",
      sort_order: parsed.data.sort_order ?? 0,
    })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tag: data });
}
