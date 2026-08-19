/**
 * Resolving "what is my role on this event", server-side.
 *
 * This deliberately uses the service-role client rather than the caller's
 * session. Reading an invite through RLS required the policy to match
 * `auth.jwt() ->> 'email'`, which is not dependable: depending on how the
 * account was created and which provider signed them in, the access token may
 * carry no email claim at all. When that happened the invitee could not see
 * their own invite row, so they were treated as having no access and bounced to
 * the public hub — the invite looked accepted on the owner's screen and did
 * nothing on theirs.
 *
 * Safety: every function here takes the already-authenticated user from the
 * server session and filters by it. Nothing accepts a caller-supplied identity,
 * so bypassing RLS cannot widen what anyone sees.
 *
 * Server-only. Never import into a client component.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole, normalizeEmail, type AdminRole } from "./roles";

export interface SessionUser {
  id: string;
  email?: string | null;
}

interface AdminRow {
  id: string;
  tournament_id: string;
  user_id: string | null;
  email: string;
  role: string;
  accepted_at: string | null;
}

/** Rows are unreadable if the migration hasn't run; treat that as "no invites". */
async function safeSelect(
  build: (client: ReturnType<typeof createAdminClient>) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>,
): Promise<AdminRow[]> {
  try {
    const { data, error } = await build(createAdminClient());
    if (error) return [];
    return (data ?? []) as AdminRow[];
  } catch {
    // No service-role key configured, or the table doesn't exist yet. Owners
    // are unaffected; invitees simply have no access until it's fixed.
    return [];
  }
}

/** The one invite row belonging to this user, by account or by email. */
function mine(rows: readonly AdminRow[], user: SessionUser): AdminRow | null {
  const email = user.email ? normalizeEmail(user.email) : null;
  return (
    rows.find(
      (r) =>
        r.user_id === user.id ||
        (email !== null && normalizeEmail(r.email) === email),
    ) ?? null
  );
}

/**
 * The caller's role on an event: "owner", an invited role, or null. Links the
 * invite to the account on first use so it survives an email change.
 */
export async function resolveRole(
  tournamentId: string,
  organizerId: string,
  user: SessionUser,
): Promise<AdminRole | null> {
  if (organizerId === user.id) return "owner";

  const rows = await safeSelect((c) =>
    c
      .from("tournament_admins")
      .select("id, tournament_id, user_id, email, role, accepted_at")
      .eq("tournament_id", tournamentId),
  );
  const row = mine(rows, user);
  if (!row || !isAdminRole(row.role) || row.role === "owner") return null;

  if (!row.user_id || !row.accepted_at) {
    try {
      await createAdminClient()
        .from("tournament_admins")
        .update({ user_id: user.id, accepted_at: new Date().toISOString() })
        .eq("id", row.id);
    } catch {
      // Linking is a convenience; the email match already granted access.
    }
  }
  return row.role;
}

export interface AdminListEntry {
  id: string;
  email: string;
  role: AdminRole;
  acceptedAt: string | null;
}

/** Everyone invited to an event. Call only when the caller is the owner. */
export async function listAdmins(
  tournamentId: string,
): Promise<AdminListEntry[]> {
  const rows = await safeSelect((c) =>
    c
      .from("tournament_admins")
      .select("id, tournament_id, user_id, email, role, accepted_at")
      .eq("tournament_id", tournamentId)
      .order("created_at"),
  );
  return rows
    .filter((r) => isAdminRole(r.role) && r.role !== "owner")
    .map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role as AdminRole,
      acceptedAt: r.accepted_at,
    }));
}

/** Tournament id -> role, for every event shared with this user. */
export async function listSharedRoles(
  user: SessionUser,
): Promise<Map<string, AdminRole>> {
  const email = user.email ? normalizeEmail(user.email) : null;
  const rows = await safeSelect((c) => {
    const q = c
      .from("tournament_admins")
      .select("id, tournament_id, user_id, email, role, accepted_at");
    // Match either identity; an invite may predate the account.
    return email
      ? q.or(`user_id.eq.${user.id},email.eq.${email}`)
      : q.eq("user_id", user.id);
  });

  const out = new Map<string, AdminRole>();
  for (const r of rows) {
    if (!isAdminRole(r.role) || r.role === "owner") continue;
    const isMine =
      r.user_id === user.id ||
      (email !== null && normalizeEmail(r.email) === email);
    if (isMine) out.set(r.tournament_id, r.role);
  }
  return out;
}
