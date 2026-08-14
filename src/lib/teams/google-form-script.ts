/**
 * Generate a Google Apps Script that builds this event's sign-up form.
 *
 * Creating a form through the Google Forms API would mean a Google Cloud
 * project, an OAuth consent screen, and stored refresh tokens — a lot of new
 * surface for something an organizer does once per event. Apps Script gets the
 * same result with no credentials on our side: the organizer pastes the script
 * into script.google.com and runs it, and the form appears in their own Drive,
 * owned by them.
 *
 * The questions are worded to match `import-registrants.ts` exactly, so the CSV
 * export maps with no manual column fixing.
 *
 * Pure — no DB, no React. Emits text, runs nothing.
 */
import type { SignupMode } from "./signup-mode";

export interface FormSpec {
  eventName: string;
  gameName?: string | null;
  eventDate?: string | null;
  signupMode: SignupMode;
  /** Roster cap — one "Teammate N" question per slot after the captain. */
  teamMax: number;
  /** Ask for a phone number as well as an email. */
  collectPhone?: boolean;
}

/**
 * Apps Script tops out well before this, but a runaway team max would emit a
 * form nobody wants to scroll. Past this, people list the rest in one box.
 */
export const MAX_TEAMMATE_QUESTIONS = 11;

/** Quote a value as a JS single-quoted string literal. */
function js(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, "\\n");
  return `'${escaped}'`;
}

/** How many "Teammate N Name" questions this roster cap calls for. */
export function teammateQuestionCount(teamMax: number): number {
  const slots = Math.floor(teamMax) - 1;
  if (!Number.isFinite(slots) || slots < 1) return 0;
  return Math.min(MAX_TEAMMATE_QUESTIONS, slots);
}

/** The form's title, e.g. "Church Game Night — Sign-up". */
export function formTitle(spec: FormSpec): string {
  return `${spec.eventName.trim() || "Tournament"} — Sign-up`;
}

function formDescription(spec: FormSpec): string {
  const bits: string[] = [];
  if (spec.gameName?.trim()) bits.push(spec.gameName.trim());
  if (spec.eventDate?.trim()) bits.push(spec.eventDate.trim());
  const when = bits.length ? `${bits.join(" · ")}. ` : "";
  const how =
    spec.signupMode === "team_only"
      ? "Sign up as a full team — one person registers the whole roster."
      : spec.signupMode === "solo_only"
        ? "Sign up individually. Teams are assigned at the event."
        : "Sign up as a full team, or solo and we'll place you on one.";
  return `${when}${how}`;
}

/**
 * Build the script. The output is deliberately plain, commented, and free of
 * anything clever — someone is going to read it before pasting it into their
 * own Google account, and it should be obvious that it only creates a form.
 */
export function buildGoogleFormScript(spec: FormSpec): string {
  const mode = spec.signupMode;
  const wantsTeams = mode !== "solo_only";
  const wantsSolo = mode !== "team_only";
  const teammates = wantsTeams ? teammateQuestionCount(spec.teamMax) : 0;

  const lines: string[] = [];
  const add = (line = "") => lines.push(line);

  add("/**");
  add(` * Sign-up form for: ${spec.eventName.trim() || "Tournament"}`);
  add(" *");
  add(" * How to use:");
  add(" *  1. Go to script.google.com and choose New project.");
  add(" *  2. Replace everything in the editor with this script.");
  add(" *  3. Press Run and approve the permission prompt.");
  add(" *  4. Open View > Logs for the form link and the edit link.");
  add(" *");
  add(" * It only creates a new form in your Drive. It reads nothing and");
  add(" * changes nothing else.");
  add(" */");
  add("function createSignupForm() {");
  add(`  var form = FormApp.create(${js(formTitle(spec))});`);
  add(`  form.setDescription(${js(formDescription(spec))});`);
  add("  // Several people often sign up from one phone at the door.");
  add("  form.setLimitOneResponsePerUser(false);");
  add("");
  add("  // Question titles below are what the importer matches on. Reword them");
  add("  // freely, but keep the words 'name', 'email', 'team name', and");
  add("  // 'teammate' where they appear.");
  add(`  form.addTextItem().setTitle('Your Name').setRequired(true);`);
  add(`  form.addTextItem().setTitle('Email Address').setRequired(true);`);
  if (spec.collectPhone) {
    add(`  form.addTextItem().setTitle('Phone Number').setRequired(false);`);
  }

  if (wantsTeams && wantsSolo) {
    add("");
    add("  // Answers containing 'team' import as a team sign-up; anything else");
    add("  // imports as a solo player.");
    add("  form.addMultipleChoiceItem()");
    add("    .setTitle('Are you signing up solo or as a team?')");
    add("    .setChoiceValues(['Solo', 'Team'])");
    add("    .setRequired(true);");
  }

  if (wantsTeams) {
    add("");
    add(
      `  form.addTextItem().setTitle('Team Name').setRequired(${
        mode === "team_only" ? "true" : "false"
      });`,
    );
    if (teammates > 0) {
      add(
        `  // One question per roster spot after you (max ${spec.teamMax} per team).`,
      );
      add(`  for (var i = 2; i <= ${teammates + 1}; i++) {`);
      add("    form.addTextItem()");
      add("      .setTitle('Teammate ' + i + ' Name')");
      add("      .setRequired(false);");
      add("  }");
    }
  }

  add("");
  add("  Logger.log('Share this link: ' + form.getPublishedUrl());");
  add("  Logger.log('Edit the form here: ' + form.getEditUrl());");
  add("}");
  add("");

  return lines.join("\n");
}
