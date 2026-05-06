import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";

const TABLES = {
  clip: "clip_flags",
  clipper: "clipper_flags",
} as const;

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { kind, id } = await params;
  const table = TABLES[kind as keyof typeof TABLES];
  if (!table) return NextResponse.json({ error: "invalid flag kind" }, { status: 400 });

  const { error } = await auth.admin.from(table).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
