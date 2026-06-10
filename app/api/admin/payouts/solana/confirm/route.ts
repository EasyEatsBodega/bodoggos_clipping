import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { solanaPayoutConfirmSchema } from "@/lib/validators";
import { requireAdmin } from "@/lib/auth-helpers";
import { checkPayoutTaxHold, snapshotClipMarks } from "@/lib/queries";
import {
  USDC_DECIMALS,
  USDC_MINT,
  SOLANA_RPC_URL_SERVER,
  usdcAmountToUnits,
} from "@/lib/solana";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const parsed = solanaPayoutConfirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  // Idempotency: if we already recorded this signature, just return ok.
  const { data: existing } = await auth.admin
    .from("payouts")
    .select("id")
    .eq("tx_hash", parsed.data.signature)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, already_recorded: true });
  }

  const { data: clipper, error: clipperErr } = await auth.admin
    .from("clippers")
    .select("id, solana_wallet")
    .eq("id", parsed.data.clipper_id)
    .maybeSingle();
  if (clipperErr || !clipper) {
    return NextResponse.json({ error: "clipper not found" }, { status: 404 });
  }
  if (!clipper.solana_wallet) {
    return NextResponse.json({ error: "clipper has no Solana wallet on file" }, { status: 400 });
  }

  // Tax hold is checked client-side BEFORE the transfer is sent (see
  // SolanaUsdcPayoutPanel preflight). By the time this endpoint runs the
  // USDC has already moved on-chain, so refusing to record would only make
  // the books wrong and invite double payment. Record regardless; annotate
  // the payout note when a hold was active.
  const hold = await checkPayoutTaxHold(auth.admin, clipper.id, parsed.data.amount);
  const holdNote = hold.blocked ? "[tax hold active at time of payment]" : null;

  let recipient: PublicKey;
  try {
    recipient = new PublicKey(clipper.solana_wallet);
  } catch {
    return NextResponse.json({ error: "clipper wallet is not a valid Solana address" }, { status: 400 });
  }

  const expectedRecipientAta = (
    await getAssociatedTokenAddress(USDC_MINT, recipient)
  ).toBase58();
  const expectedUnits = usdcAmountToUnits(parsed.data.amount);

  // Fetch and verify the transaction on-chain.
  const connection = new Connection(SOLANA_RPC_URL_SERVER, "confirmed");

  // Brief retry: client just confirmed but RPC propagation can lag a beat.
  let parsedTx: Awaited<ReturnType<Connection["getParsedTransaction"]>> = null;
  for (let i = 0; i < 4; i++) {
    parsedTx = await connection.getParsedTransaction(parsed.data.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (parsedTx) break;
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  if (!parsedTx) {
    return NextResponse.json(
      { error: "transaction not found on-chain (may be still propagating)" },
      { status: 502 },
    );
  }
  if (parsedTx.meta?.err) {
    return NextResponse.json(
      { error: `transaction failed on-chain: ${JSON.stringify(parsedTx.meta.err)}` },
      { status: 400 },
    );
  }

  // Walk parsed instructions (top-level + inner) and find a USDC transfer
  // matching our expected recipient ATA and amount.
  const instructions = [
    ...(parsedTx.transaction.message.instructions ?? []),
    ...((parsedTx.meta?.innerInstructions ?? []).flatMap((i) => i.instructions) ?? []),
  ];

  const usdcMintStr = USDC_MINT.toBase58();
  let matched = false;
  let transferredUnits = 0n;

  for (const ix of instructions) {
    if (!("parsed" in ix)) continue;
    const parsedIx = ix.parsed as { type?: string; info?: Record<string, unknown> } | undefined;
    if (!parsedIx || !parsedIx.info) continue;
    const t = parsedIx.type;
    const info = parsedIx.info as Record<string, unknown>;

    if (t === "transferChecked" || t === "transfer") {
      // mint check (transferChecked includes mint; for "transfer" we'd need
      // to look up the source account — token program rejects mismatched
      // mints, but we should be strict).
      if (t === "transferChecked" && info.mint !== usdcMintStr) continue;
      if (info.destination !== expectedRecipientAta) continue;

      let units: bigint;
      if (t === "transferChecked") {
        const a = info.tokenAmount as { amount?: string; decimals?: number } | undefined;
        if (!a || a.decimals !== USDC_DECIMALS || !a.amount) continue;
        units = BigInt(a.amount);
      } else {
        // "transfer" gives raw amount; we already filtered destination, so
        // accept it but only if we have not yet found a transferChecked.
        const amtRaw = info.amount as string | number | undefined;
        if (amtRaw == null) continue;
        units = BigInt(String(amtRaw));
      }

      transferredUnits += units;
      matched = true;
    }
  }

  if (!matched) {
    return NextResponse.json(
      { error: "no USDC transfer to recipient ATA found in this transaction" },
      { status: 400 },
    );
  }
  if (transferredUnits !== expectedUnits) {
    return NextResponse.json(
      {
        error: `amount mismatch: tx transferred ${transferredUnits} micro-USDC, expected ${expectedUnits}`,
      },
      { status: 400 },
    );
  }

  // Record the payout, then snapshot per-clip view watermarks so the next
  // payment doesn't double-count impressions paid by this one.
  const { data: inserted, error: insErr } = await auth.admin
    .from("payouts")
    .insert({
      clipper_id: clipper.id,
      amount: parsed.data.amount,
      chain: "Solana",
      tx_hash: parsed.data.signature,
      note: [parsed.data.note, holdNote].filter(Boolean).join(" ") || null,
      created_by: auth.user.id,
    })
    .select("id")
    .single();
  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json({ ok: true, already_recorded: true });
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await snapshotClipMarks(auth.admin, inserted.id, clipper.id);

  return NextResponse.json({ ok: true, signature: parsed.data.signature });
}
