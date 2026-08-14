/**
 * Who is allowed to sign up, and how.
 *
 * Some events want whole teams only (players organize themselves and register
 * together), some want individuals only (the organizer builds every team from
 * the pool), and some want both. This governs the native sign-up page — the
 * QR-code form we control. A Google Form is built by the organizer, so it can
 * differ; CSV imports are trusted and are never filtered by this.
 *
 * Pure — no DB, no React.
 */

export type SignupMode = "both" | "team_only" | "solo_only";

export type SignupType = "solo" | "team";

/** Absent config means the original behavior: both paths offered. */
export const DEFAULT_SIGNUP_MODE: SignupMode = "both";

export const SIGNUP_MODE_LABELS: Record<SignupMode, string> = {
  both: "Teams or solo players",
  team_only: "Full teams only",
  solo_only: "Solo players only",
};

/** Organizer-facing explanation of each choice. */
export const SIGNUP_MODE_BLURBS: Record<SignupMode, string> = {
  both: "Sign up a full team, or join alone and get placed on one.",
  team_only:
    "Players form their own teams and one person registers the whole roster.",
  solo_only:
    "Everyone signs up individually; you build the teams from the solo pool.",
};

export function normalizeSignupMode(value: unknown): SignupMode {
  return value === "team_only" || value === "solo_only" || value === "both"
    ? value
    : DEFAULT_SIGNUP_MODE;
}

export function allowsSignupType(mode: SignupMode, type: SignupType): boolean {
  if (mode === "both") return true;
  return mode === "team_only" ? type === "team" : type === "solo";
}

/** The paths the public form should offer, in display order. */
export function allowedSignupTypes(mode: SignupMode): SignupType[] {
  return (["team", "solo"] as const).filter((t) => allowsSignupType(mode, t));
}

/** Rejection wording shared by the form and the server action. */
export function signupTypeBlockedMessage(mode: SignupMode): string {
  return mode === "team_only"
    ? "This event only accepts full-team sign-ups. Form a team and register everyone together."
    : "This event only accepts solo sign-ups. Sign up individually and the organizer will build the teams.";
}

/** Shown at the top of the public form so people know what to expect. */
export function signupModeHint(mode: SignupMode): string {
  return SIGNUP_MODE_BLURBS[mode];
}
