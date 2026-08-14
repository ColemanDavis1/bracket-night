import { NextResponse, type NextRequest } from "next/server";

/**
 * Pass through only. Do not call Supabase Auth here.
 *
 * `getUser()` is a network round-trip. When Auth is slow or the project is
 * paused it hangs until Vercel returns MIDDLEWARE_INVOCATION_TIMEOUT (504)
 * for every page — including the public homepage for a logged-in organizer.
 * Session checks stay in Server Components and server actions, which have a
 * much longer budget than Edge middleware.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
