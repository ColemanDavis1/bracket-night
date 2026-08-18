/**
 * Who can do what on an event.
 *
 * The creator is the owner and always holds every capability. Anyone else is
 * invited by email with one role, so an organizer can hand the sign-up form to a
 * volunteer without handing over the whole event.
 *
 * Roles are enforced in two places: these capability checks guard every server
 * action and hide the UI, and RLS independently splits owner/admin writes from
 * the narrower roles (see migration 0012). Keep the two in step — this module is
 * the readable copy.
 *
 * Pure — no DB, no React.
 */

export type AdminRole = "owner" | "admin" | "registrar" | "scorekeeper";

/** Roles an owner can hand out. "owner" is the creator and is not assignable. */
export const ASSIGNABLE_ROLES: AdminRole[] = [
  "admin",
  "registrar",
  "scorekeeper",
];

export type Capability =
  /** Invite, re-role, and remove other admins. */
  | "manage_admins"
  /** Delete or archive the whole event. */
  | "delete_event"
  /** Format, scoring, team sizes, resetting the draw. */
  | "edit_settings"
  /** Build the sign-up form and open or close sign-ups. */
  | "manage_form"
  /** Approve sign-ups and export responses. */
  | "manage_signups"
  /** Teams, rosters, walk-ins, check-in. */
  | "manage_roster"
  /** Enter and correct scores. */
  | "enter_scores"
  /** Court assignments and the call board. */
  | "manage_courts";

const ALL: Capability[] = [
  "manage_admins",
  "delete_event",
  "edit_settings",
  "manage_form",
  "manage_signups",
  "manage_roster",
  "enter_scores",
  "manage_courts",
];

/**
 * An admin can run the whole event but cannot delete it or change who else has
 * access — those stay with the person whose account owns it.
 */
export const ROLE_CAPABILITIES: Record<AdminRole, readonly Capability[]> = {
  owner: ALL,
  admin: [
    "edit_settings",
    "manage_form",
    "manage_signups",
    "manage_roster",
    "enter_scores",
    "manage_courts",
  ],
  registrar: ["manage_form", "manage_signups", "manage_roster"],
  scorekeeper: ["enter_scores", "manage_courts"],
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: "Owner",
  admin: "Co-organizer",
  registrar: "Sign-ups & rosters",
  scorekeeper: "Scorekeeper",
};

export const ROLE_BLURBS: Record<AdminRole, string> = {
  owner: "Created the event. Full control, including access and deletion.",
  admin:
    "Everything except deleting the event and managing access: the form, sign-ups, rosters, settings, and scores.",
  registrar:
    "Sends and edits the sign-up form, approves sign-ups, and builds the rosters. Cannot enter scores.",
  scorekeeper:
    "Enters scores and runs the call board. Cannot change the form, rosters, or settings.",
};

export function isAdminRole(value: unknown): value is AdminRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "registrar" ||
    value === "scorekeeper"
  );
}

/** Null role means no access at all (a public viewer). */
export function can(role: AdminRole | null, capability: Capability): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role].includes(capability);
}

/** Every capability a role holds, for showing what an invite grants. */
export function capabilitiesOf(role: AdminRole): readonly Capability[] {
  return ROLE_CAPABILITIES[role];
}

/** Does this role get any organizer UI at all? */
export function hasAnyAccess(role: AdminRole | null): boolean {
  return role !== null;
}

/** Message for a blocked server action, naming what the role lacks. */
export function deniedMessage(
  role: AdminRole | null,
  capability: Capability,
): string {
  if (!role) return "You don't have access to this event.";
  const what = CAPABILITY_LABELS[capability];
  return `Your role (${ROLE_LABELS[role]}) can't ${what}. Ask the event owner.`;
}

export const CAPABILITY_LABELS: Record<Capability, string> = {
  manage_admins: "change who has access",
  delete_event: "delete this event",
  edit_settings: "change event settings",
  manage_form: "change the sign-up form",
  manage_signups: "manage sign-ups",
  manage_roster: "change teams and rosters",
  enter_scores: "enter scores",
  manage_courts: "run the call board",
};

/** Normalize a stored email for comparison and storage. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reason an invite can't be created, or null when it's fine. */
export function inviteError(
  email: string,
  ownerEmail: string | null,
  existing: readonly string[],
): string | null {
  const clean = normalizeEmail(email);
  if (!clean) return "Enter an email address.";
  if (!EMAIL_RE.test(clean)) return "That doesn't look like an email address.";
  if (ownerEmail && clean === normalizeEmail(ownerEmail)) {
    return "You already own this event.";
  }
  if (existing.map(normalizeEmail).includes(clean)) {
    return "That person already has access.";
  }
  return null;
}
