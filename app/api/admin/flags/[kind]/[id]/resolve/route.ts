import { NextResponse } from "next/server";
import { resolveFlagSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

const TABLES = {
  clip: "clip_flags",
  clipper: "clipper_flags",
} as const;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { kind, id } = await params;
  const table = TABLES[kind as keyof typeof TABLES];
  if (!table) return NextResponse.json({ error: "invalid flag kind" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = resolveFlagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { error } = await auth.admin
    .from(table)
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: auth.user.id,
      resolution: parsed.data.resolution ?? null,
    })
    .eq("id", id)
    .is("resolved_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
