import { NextResponse } from "next/server";
import { buildAuthorizeUrl, generatePkce } from "@/lib/x-oauth";

export async function GET() {
  const clientId = process.env.X_OAUTH_CLIENT_ID;
  const redirectUri = process.env.X_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "x oauth not configured" }, { status: 500 });
  }

  const { verifier, challenge, state } = generatePkce();
  const url = buildAuthorizeUrl({ clientId, redirectUri, state, challenge });

  const res = NextResponse.redirect(url);
  // Short-lived, http-only cookies for the round trip.
  const cookieOpts = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 600, secure: process.env.NODE_ENV === "production" };
  res.cookies.set("x_oauth_state", state, cookieOpts);
  res.cookies.set("x_oauth_verifier", verifier, cookieOpts);
  return res;
}
