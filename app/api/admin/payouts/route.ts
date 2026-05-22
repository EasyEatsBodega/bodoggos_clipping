import { NextResponse } from "next/server";
import { payoutSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";
import { checkPayoutTaxHold, snapshotClipMarks } from "@/lib/queries";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = payoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const hold = await checkPayoutTaxHold(auth.admin, parsed.data.clipper_id, parsed.data.amount);
  if (hold.blocked) return NextResponse.json({ error: hold.reason }, { status: 403 });

  const { data: inserted, error } = await auth.admin
    .from("payouts")
    .insert({
      clipper_id: parsed.data.clipper_id,
      amount: parsed.data.amount.toFixed(2),
      chain: parsed.data.chain,
      tx_hash: parsed.data.tx_hash ?? null,
      note: parsed.data.note ?? null,
      created_by: auth.user.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await snapshotClipMarks(auth.admin, inserted.id, parsed.data.clipper_id);

  return NextResponse.json({ ok: true });
}
