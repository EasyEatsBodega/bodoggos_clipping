import { NextResponse } from "next/server";
import { altHandleSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";

// POST: whitelist an extra X handle this clipper may submit from.
// Body: { x_handle, note? }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = altHandleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const { data: clipper } = await auth.admin
    .from("clippers")
    .select("id, x_handle")
    .eq("id", id)
    .maybeSingle();
  if (!clipper) return NextResponse.json({ error: "clipper not found" }, { status: 404 });

  const handle = parsed.data.x_handle.toLowerCase();
  if (handle === clipper.x_handle.toLowerCase()) {
    return NextResponse.json(
      { error: "this is the clipper's primary handle" },
      { status: 400 },
    );
  }

  const { error } = await auth.admin.from("clipper_alt_handles").insert({
    clipper_id: id,
    x_handle: handle,
    note: parsed.data.note ?? null,
    added_by: auth.user.id,
  });
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "that handle is already whitelisted for this clipper" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
