/**
 * Flatten sign-up responses into one spreadsheet row per person.
 *
 * Excel opens CSV natively, so CSV is what we emit — no xlsx dependency, and
 * the file still double-clicks into a workbook. Team-scope answers repeat on
 * each member's row so the sheet can be sorted or filtered by any column
 * without losing the team context.
 *
 * Pure — no DB, no React.
 */
import type {
  AnswerMap,
  AnswerValue,
  SignupFormConfig,
} from "./form-schema";
import { questionsFor } from "./form-schema";

export interface ExportPerson {
  name: string;
  email: string | null;
  phone: string | null;
  teamName: string | null;
  isCaptain: boolean;
  signupType: "solo" | "team";
  status: "pending" | "approved" | "declined";
  source: string;
  checkedIn: boolean;
  answers: AnswerMap;
}

function escape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function cell(value: AnswerValue | undefined): string {
  if (value === undefined) return "";
  return Array.isArray(value) ? value.join("; ") : value;
}

/**
 * Team-scope answers are captured once, on the captain's submission, so a
 * member's row inherits them from whoever captained their team.
 */
function teamAnswerLookup(people: readonly ExportPerson[]) {
  const byTeam = new Map<string, AnswerMap>();
  for (const p of people) {
    if (p.teamName && p.isCaptain) byTeam.set(p.teamName, p.answers);
  }
  // Fall back to any member's answers for a team with no captain flagged.
  for (const p of people) {
    if (p.teamName && !byTeam.has(p.teamName)) byTeam.set(p.teamName, p.answers);
  }
  return byTeam;
}

/** Column headers, in the order `signupResponsesCsv` writes them. */
export function responseHeaders(form: SignupFormConfig): string[] {
  return [
    "Team",
    "Role",
    "Name",
    "Email",
    "Phone",
    "Status",
    "Source",
    "Checked in",
    ...questionsFor(form, "team").map((q) => q.label),
    ...questionsFor(form, "person").map((q) => q.label),
  ];
}

export function signupResponsesCsv(
  eventName: string,
  form: SignupFormConfig,
  people: readonly ExportPerson[],
): string {
  const teamQuestions = questionsFor(form, "team");
  const personQuestions = questionsFor(form, "person");
  const teamAnswers = teamAnswerLookup(people);

  const rows: string[][] = [responseHeaders(form)];
  for (const p of people) {
    const shared = p.teamName ? (teamAnswers.get(p.teamName) ?? {}) : p.answers;
    rows.push([
      p.teamName ?? "",
      p.signupType === "solo" ? "Solo" : p.isCaptain ? "Captain" : "Member",
      p.name,
      p.email ?? "",
      p.phone ?? "",
      p.status,
      p.source,
      p.checkedIn ? "Yes" : "No",
      ...teamQuestions.map((q) => cell(shared[q.id])),
      ...personQuestions.map((q) => cell(p.answers[q.id])),
    ]);
  }

  const body = rows.map((r) => r.map(escape).join(",")).join("\n");
  return `${eventName} — Sign-up responses\n${body}\n`;
}
