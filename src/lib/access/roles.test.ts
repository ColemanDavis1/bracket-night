import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES,
  can,
  capabilitiesOf,
  deniedMessage,
  hasAnyAccess,
  inviteError,
  isAdminRole,
  normalizeEmail,
  ROLE_CAPABILITIES,
  type AdminRole,
} from "./roles";

describe("can", () => {
  it("gives the owner everything", () => {
    for (const cap of ROLE_CAPABILITIES.owner) {
      expect(can("owner", cap)).toBe(true);
    }
    expect(can("owner", "manage_admins")).toBe(true);
    expect(can("owner", "delete_event")).toBe(true);
  });

  it("lets a co-organizer run the event but not give away access", () => {
    expect(can("admin", "edit_settings")).toBe(true);
    expect(can("admin", "manage_form")).toBe(true);
    expect(can("admin", "enter_scores")).toBe(true);
    expect(can("admin", "manage_admins")).toBe(false);
    expect(can("admin", "delete_event")).toBe(false);
  });

  it("limits a registrar to sign-ups and rosters", () => {
    expect(can("registrar", "manage_form")).toBe(true);
    expect(can("registrar", "manage_signups")).toBe(true);
    expect(can("registrar", "manage_roster")).toBe(true);
    expect(can("registrar", "enter_scores")).toBe(false);
    expect(can("registrar", "edit_settings")).toBe(false);
  });

  it("limits a scorekeeper to scores and courts", () => {
    expect(can("scorekeeper", "enter_scores")).toBe(true);
    expect(can("scorekeeper", "manage_courts")).toBe(true);
    expect(can("scorekeeper", "manage_form")).toBe(false);
    expect(can("scorekeeper", "manage_roster")).toBe(false);
  });

  it("gives a public viewer nothing", () => {
    expect(can(null, "enter_scores")).toBe(false);
    expect(can(null, "manage_form")).toBe(false);
  });
});

describe("role shape", () => {
  it("does not offer owner as an assignable role", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("owner");
    expect(ASSIGNABLE_ROLES).toEqual(["admin", "registrar", "scorekeeper"]);
  });

  it("recognizes only real roles", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("superuser")).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });

  it("reports capabilities for an invite summary", () => {
    expect(capabilitiesOf("scorekeeper")).toContain("enter_scores");
    expect(capabilitiesOf("scorekeeper")).not.toContain("edit_settings");
  });
});

describe("hasAnyAccess", () => {
  it("separates every role from no access", () => {
    for (const r of ["owner", "admin", "registrar", "scorekeeper"] as AdminRole[]) {
      expect(hasAnyAccess(r)).toBe(true);
    }
    expect(hasAnyAccess(null)).toBe(false);
  });
});

describe("deniedMessage", () => {
  it("names the role and the missing capability", () => {
    expect(deniedMessage("scorekeeper", "manage_form")).toBe(
      "Your role (Scorekeeper) can't change the sign-up form. Ask the event owner.",
    );
  });

  it("is generic for someone with no access", () => {
    expect(deniedMessage(null, "enter_scores")).toBe(
      "You don't have access to this event.",
    );
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Coleman.Davis@UNC.edu ")).toBe(
      "coleman.davis@unc.edu",
    );
  });
});

describe("inviteError", () => {
  it("accepts a fresh address", () => {
    expect(inviteError("sam@x.co", "owner@x.co", [])).toBeNull();
  });

  it("rejects blanks and malformed addresses", () => {
    expect(inviteError("  ", null, [])).toBe("Enter an email address.");
    expect(inviteError("sam", null, [])).toBe(
      "That doesn't look like an email address.",
    );
  });

  it("rejects the owner's own address", () => {
    expect(inviteError("Owner@X.co", "owner@x.co", [])).toBe(
      "You already own this event.",
    );
  });

  it("rejects someone who already has access, case-insensitively", () => {
    expect(inviteError("SAM@x.co", "owner@x.co", ["sam@x.co"])).toBe(
      "That person already has access.",
    );
  });
});
