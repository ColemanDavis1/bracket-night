import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — BYPASSES Row Level Security. Server-only.
 *
 * Used solely to cache AI previews generated on behalf of anonymous public
 * viewers. Never import this into client code.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
