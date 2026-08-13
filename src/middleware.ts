import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { fetchWithTimeout, hasAuthCookie } from "@/lib/middleware-auth";

/**
 * Refreshes the Supabase auth session cookie on navigation so Server
 * Components always see a valid session. Public routes still work for
 * anonymous visitors — this only keeps the cookie fresh.
 *
 * `getUser()` hits the Auth API. On Vercel Edge a hung fetch exceeds the
 * middleware budget and the whole site 504s (`MIDDLEWARE_INVOCATION_TIMEOUT`).
 * Skip the call when there is no session cookie, and abort it if Auth is slow.
 */

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !hasAuthCookie(request.cookies.getAll())) {
    return response;
  }

  try {
    const supabase = createServerClient(url, key, {
      global: { fetch: fetchWithTimeout },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: CookieOptions;
          }[],
        ) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    await supabase.auth.getUser();
  } catch {
    // Session refresh must never take down the page. Pages still call getUser().
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
