/**
 * How people get into a tournament. This is the organizer-facing choice; each
 * style is a preset over the primitives that already existed (entryMode,
 * signupEnabled, signupMode), so the engine and the bracket are untouched and
 * every primitive stays individually editable afterwards.
 *
 * Pure — no DB, no React.
 */
import type { SignupMode } from "@/lib/teams/signup-mode";

export type SignupStyle = "large_event" | "manual" | "individual";

export const DEFAULT_SIGNUP_STYLE: SignupStyle = "manual";

export const SIGNUP_STYLE_LABELS: Record<SignupStyle, string> = {
  large_event: "Large event",
  manual: "Manual entry",
  individual: "Individual sign-up",
};

export const SIGNUP_STYLE_BLURBS: Record<SignupStyle, string> = {
  large_event:
    "Teams register through a custom form you build and share. Responses are stored, exportable, and become your rosters.",
  manual: "No public form. You type in the players or teams yourself.",
  individual:
    "People sign up one at a time through a shared link. Each person is their own entrant.",
};

export interface StylePreset {
  entryMode: "individual" | "team";
  signupEnabled: boolean;
  signupMode: SignupMode;
}

/** The primitives a style sets when the organizer picks it. */
export function presetForStyle(style: SignupStyle): StylePreset {
  switch (style) {
    case "large_event":
      return { entryMode: "team", signupEnabled: true, signupMode: "team_only" };
    case "individual":
      return {
        entryMode: "individual",
        signupEnabled: true,
        signupMode: "solo_only",
      };
    default:
      return {
        entryMode: "individual",
        signupEnabled: false,
        signupMode: "both",
      };
  }
}

export function normalizeSignupStyle(value: unknown): SignupStyle {
  return value === "large_event" || value === "individual" || value === "manual"
    ? value
    : DEFAULT_SIGNUP_STYLE;
}

/**
 * Infer the style of an event created before styles existed, so the UI can
 * show it something sensible rather than defaulting everyone to manual.
 */
export function inferSignupStyle(config: {
  entryMode?: "individual" | "team";
  signupEnabled?: boolean;
}): SignupStyle {
  if (config.entryMode === "team") return "large_event";
  return config.signupEnabled ? "individual" : "manual";
}

/** Only the large-event style uses the custom form builder. */
export function usesCustomForm(style: SignupStyle): boolean {
  return style !== "manual";
}
