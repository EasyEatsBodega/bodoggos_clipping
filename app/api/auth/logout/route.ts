import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.url), { status: 303 });
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
  await supabase.auth.signOut();
  return res;
}
