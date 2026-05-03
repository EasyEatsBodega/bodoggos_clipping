import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Protect /dashboard/* and /admin/*. Block banned clippers everywhere except /auth/*.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isProtectedClipper = pathname.startsWith("/dashboard");
  const isProtectedAdmin = pathname.startsWith("/admin");
  const isOnboarding = pathname.startsWith("/onboarding");
  if (!isProtectedClipper && !isProtectedAdmin && !isOnboarding) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (items: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          for (const { name, value, options } of items) {
            res.cookies.set(name, value, options as never);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Banned check (skip on onboarding so we can still log them out cleanly there)
  if (!isOnboarding) {
    const { data: clipper } = await supabase
      .from("clippers")
      .select("banned")
      .eq("id", user.id)
      .maybeSingle();
    if (clipper?.banned) {
      const url = req.nextUrl.clone();
      url.pathname = "/suspended";
      return NextResponse.redirect(url);
    }
  }

  if (isProtectedAdmin) {
    const { data: admin } = await supabase
      .from("admin_users")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (!admin) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/onboarding"],
};
