import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { checkPayoutTaxHold } from "@/lib/queries";

const schema = z.object({
  clipper_id: z.string().uuid(),
  amount: z.number().positive(),
});

// POST: preflight tax-hold check, called by the Solana payout panel BEFORE
// the transfer is sent. This is the only place the hold should stop a
// payment — once USDC has moved on-chain, the confirm endpoint records it
// unconditionally (with a hold annotation) so the books always match the
// chain.
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const hold = await checkPayoutTaxHold(
    auth.admin,
    parsed.data.clipper_id,
    parsed.data.amount,
  );
  return NextResponse.json(hold);
}
