import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

// Refreshes the Supabase auth session on every request and redirects unauthenticated visitors
// away from the app to /login. Route-level RLS is still the real security boundary — this is
// just UX (don't show the app shell before we even know if there's a session).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Consumes the token from an emailed link and only then knows who the user is, so it must be
  // reachable in both states — redirecting it either way would break every auth email.
  if (pathname.startsWith("/auth/confirm")) {
    return supabaseResponse;
  }

  // Reachable without a session; a signed-in visitor is sent to the app instead.
  const isSignedOutRoute = pathname.startsWith("/login") || pathname.startsWith("/forgot-password");

  if (!user && !isSignedOutRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isSignedOutRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
