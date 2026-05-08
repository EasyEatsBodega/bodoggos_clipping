import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { SOLANA_RPC_URL_SERVER } from "@/lib/solana";

// Admin-gated JSON-RPC proxy. The browser ConnectionProvider points at this
// route so the upstream Solana RPC URL (and any API key) stays server-side.
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(SOLANA_RPC_URL_SERVER, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `upstream RPC unreachable: ${msg}` },
      { status: 502 },
    );
  }

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
