/**
 * The custom sign-up form an organizer builds for a large event.
 *
 * Definition lives in `tournaments.config.signupForm`; answers live in
 * `registrants.answers` keyed by question id. Both the public form and the
 * server action validate through this module, so a stale browser tab can never
 * store something the organizer's rules disallow.
 *
 * Two scopes, because a team sign-up is one submission covering several people:
 *  - "team"   asked once of the captain (e.g. "any members interested in a
 *             Bible study?")
 *  - "person" asked of every member on the roster (e.g. dorm)
 *
 * Pure — no DB, no React.
 */

export type QuestionType =
  | "short_text"
  | "paragraph"
  | "choice"
  | "multi_choice"
  | "yes_no"
  | "number"
  | "email"
  | "phone"
  | "date"
  | "time"
  | "url"
  | "consent";

export type QuestionScope = "team" | "person";

/** Built-in contact fields are off / optional / required rather than custom. */
export type FieldRule = "off" | "optional" | "required";

export interface FormQuestion {
  id: string;
  label: string;
  /** Small print under the label. */
  help?: string;
  type: QuestionType;
  required: boolean;
  scope: QuestionScope;
  /** choice / multi_choice only. */
  options?: string[];
  /**
   * Show only when another answer matches — this is how "if yes, which ones?"
   * follow-ups work without a special question type.
   */
  showIf?: { questionId: string; equals: string };
}

export interface SignupFormConfig {
  /** Blurb at the top of the public form. */
  intro: string | null;
  email: FieldRule;
  phone: FieldRule;
  /** Ask contact details of the captain only, or of every member. */
  contactScope: "captain" | "everyone";
  /** Require a full minimum roster at submission rather than filling in later. */
  requireMinRoster: boolean;
  /** ISO timestamp after which the form stops accepting responses. */
  closesAt: string | null;
  questions: FormQuestion[];
}

export type AnswerValue = string | string[];
export type AnswerMap = Record<string, AnswerValue>;

export interface AnswerError {
  questionId: string;
  message: string;
}

const MAX_SHORT = 200;
const MAX_PARAGRAPH = 2000;
export const MAX_QUESTIONS = 25;
export const MAX_OPTIONS = 20;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: "Short answer",
  paragraph: "Paragraph",
  choice: "Multiple choice (pick one)",
  multi_choice: "Checkboxes (pick any)",
  yes_no: "Yes / No",
  number: "Number",
  email: "Email",
  phone: "Phone",
  date: "Date",
  time: "Time",
  url: "Link",
  consent: "Agreement (must be accepted)",
};

export const YES = "Yes";
export const NO = "No";
/**
 * The only acceptable answer to a consent question. Storing the word rather
 * than a boolean keeps the exported spreadsheet readable.
 */
export const AGREED = "Agreed";

export function defaultSignupForm(): SignupFormConfig {
  return {
    intro: null,
    email: "required",
    phone: "optional",
    contactScope: "captain",
    requireMinRoster: false,
    closesAt: null,
    questions: [],
  };
}

const isRule = (v: unknown): v is FieldRule =>
  v === "off" || v === "optional" || v === "required";

const isType = (v: unknown): v is QuestionType =>
  typeof v === "string" && v in QUESTION_TYPE_LABELS;

function normalizeQuestion(raw: unknown, index: number): FormQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  const label = typeof q.label === "string" ? q.label.trim() : "";
  if (!label) return null;
  const type = isType(q.type) ? q.type : "short_text";
  const id =
    typeof q.id === "string" && q.id.trim() ? q.id.trim() : `q${index + 1}`;

  const options =
    type === "choice" || type === "multi_choice"
      ? (Array.isArray(q.options) ? q.options : [])
          .filter((o): o is string => typeof o === "string")
          .map((o) => o.trim())
          .filter(Boolean)
          .slice(0, MAX_OPTIONS)
      : undefined;

  const showIfRaw = q.showIf as Record<string, unknown> | undefined;
  const showIf =
    showIfRaw &&
    typeof showIfRaw.questionId === "string" &&
    typeof showIfRaw.equals === "string"
      ? { questionId: showIfRaw.questionId, equals: showIfRaw.equals }
      : undefined;

  return {
    id,
    label,
    help: typeof q.help === "string" && q.help.trim() ? q.help.trim() : undefined,
    type,
    required: type === "consent" ? true : q.required === true,
    scope: q.scope === "person" ? "person" : "team",
    ...(options ? { options } : {}),
    ...(showIf ? { showIf } : {}),
  };
}

/** Coerce whatever is in config into a form we can render and validate. */
export function normalizeSignupForm(value: unknown): SignupFormConfig {
  const base = defaultSignupForm();
  if (!value || typeof value !== "object") return base;
  const v = value as Record<string, unknown>;

  const questions = (Array.isArray(v.questions) ? v.questions : [])
    .map(normalizeQuestion)
    .filter((q): q is FormQuestion => q !== null)
    .slice(0, MAX_QUESTIONS);

  return {
    intro:
      typeof v.intro === "string" && v.intro.trim() ? v.intro.trim() : null,
    email: isRule(v.email) ? v.email : base.email,
    phone: isRule(v.phone) ? v.phone : base.phone,
    contactScope: v.contactScope === "everyone" ? "everyone" : "captain",
    requireMinRoster: v.requireMinRoster === true,
    closesAt:
      typeof v.closesAt === "string" && v.closesAt.trim()
        ? v.closesAt.trim()
        : null,
    questions,
  };
}

export function questionsFor(
  form: SignupFormConfig,
  scope: QuestionScope,
): FormQuestion[] {
  return form.questions.filter((q) => q.scope === scope);
}

const isBlank = (value: AnswerValue | undefined): boolean =>
  value === undefined ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0);

/**
 * A question gated by `showIf` is only asked when its trigger matches. Hidden
 * questions are never required and their answers are dropped.
 */
export function isQuestionVisible(
  question: FormQuestion,
  answers: AnswerMap,
): boolean {
  if (!question.showIf) return true;
  const trigger = answers[question.showIf.questionId];
  if (trigger === undefined) return false;
  return Array.isArray(trigger)
    ? trigger.includes(question.showIf.equals)
    : trigger === question.showIf.equals;
}

/** Questions actually shown for these answers, in order. */
export function visibleQuestions(
  questions: readonly FormQuestion[],
  answers: AnswerMap,
): FormQuestion[] {
  return questions.filter((q) => isQuestionVisible(q, answers));
}

/** A consent question is an agreement, so "required" means "must accept". */
export function consentRequiredMessage(): string {
  return "You must accept this to sign up.";
}

function valueError(q: FormQuestion, value: AnswerValue): string | null {
  if (q.type === "consent") {
    const s = Array.isArray(value) ? (value[0] ?? "") : value;
    return s === AGREED ? null : consentRequiredMessage();
  }
  if (q.type === "multi_choice") {
    const picked = Array.isArray(value) ? value : [value];
    const allowed = new Set(q.options ?? []);
    return picked.every((p) => allowed.has(p)) ? null : "Pick from the list.";
  }
  const s = Array.isArray(value) ? (value[0] ?? "") : value;
  switch (q.type) {
    case "choice":
      return (q.options ?? []).includes(s) ? null : "Pick from the list.";
    case "yes_no":
      return s === YES || s === NO ? null : "Choose Yes or No.";
    case "number":
      return Number.isFinite(Number(s)) ? null : "Enter a number.";
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
        ? null
        : "Enter a valid email address.";
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? null : "Enter a date.";
    case "time":
      return /^\d{2}:\d{2}(:\d{2})?$/.test(s.trim()) ? null : "Enter a time.";
    case "url":
      // Deliberately loose: people paste "instagram.com/x" as often as a full
      // URL, and rejecting that helps nobody.
      return s.trim().includes(".") && !/\s/.test(s.trim())
        ? null
        : "Enter a link.";
    case "paragraph":
      return s.length <= MAX_PARAGRAPH
        ? null
        : `Keep this under ${MAX_PARAGRAPH} characters.`;
    default:
      return s.length <= MAX_SHORT
        ? null
        : `Keep this under ${MAX_SHORT} characters.`;
  }
}

/** Every problem with one respondent's answers, in question order. */
export function validateAnswers(
  questions: readonly FormQuestion[],
  answers: AnswerMap,
): AnswerError[] {
  const errors: AnswerError[] = [];
  for (const q of questions) {
    if (!isQuestionVisible(q, answers)) continue;
    const value = answers[q.id];
    if (isBlank(value)) {
      if (q.required) {
        errors.push({
          questionId: q.id,
          message:
            q.type === "consent"
              ? consentRequiredMessage()
              : "This question is required.",
        });
      }
      continue;
    }
    const problem = valueError(q, value as AnswerValue);
    if (problem) errors.push({ questionId: q.id, message: problem });
  }
  return errors;
}

/**
 * Keep only answers to questions that exist and are visible, trimmed and
 * length-capped. Sign-up is a public write path, so nothing else is stored.
 */
export function sanitizeAnswers(
  questions: readonly FormQuestion[],
  answers: AnswerMap,
): AnswerMap {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const out: AnswerMap = {};
  for (const [id, raw] of Object.entries(answers ?? {})) {
    const q = byId.get(id);
    if (!q || !isQuestionVisible(q, answers)) continue;
    const cap = q.type === "paragraph" ? MAX_PARAGRAPH : MAX_SHORT;
    if (Array.isArray(raw)) {
      const cleaned = raw
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().slice(0, cap))
        .filter(Boolean);
      if (cleaned.length) out[id] = cleaned;
    } else if (typeof raw === "string") {
      const cleaned = raw.trim().slice(0, cap);
      if (cleaned) out[id] = cleaned;
    }
  }
  return out;
}

/** Has the sign-up window closed? An unset close time never closes. */
export function formClosed(
  form: SignupFormConfig,
  now: Date = new Date(),
): boolean {
  if (!form.closesAt) return false;
  const closes = new Date(form.closesAt).getTime();
  return Number.isFinite(closes) && closes <= now.getTime();
}

/** Shown on the public page when the window has passed. */
export const FORM_CLOSED_MESSAGE =
  "Sign-ups for this event have closed. Check with the organizer — they can still add you at the door.";

/**
 * Roster-size rule at submission time. The max always applies; the min only
 * when the organizer requires a full roster up front.
 */
export function rosterSizeError(
  memberCount: number,
  size: { min: number; max: number },
  requireMinRoster: boolean,
): string | null {
  if (memberCount > size.max) {
    return `Teams can have at most ${size.max} players.`;
  }
  if (requireMinRoster && memberCount < size.min) {
    const short = size.min - memberCount;
    return `This event needs at least ${size.min} players per team — add ${short} more.`;
  }
  return null;
}

/**
 * Turn validation errors into one sentence naming the questions, so the server
 * action and the public form report a rejection identically.
 */
export function describeAnswerErrors(
  questions: readonly FormQuestion[],
  errors: readonly AnswerError[],
): string {
  const label = new Map(questions.map((q) => [q.id, q.label]));
  return errors
    .map((e) => `${label.get(e.questionId) ?? "Question"}: ${e.message}`)
    .join(" ");
}

/**
 * Built-in contact rules. Whether they apply to a given member depends on
 * contactScope: captain-only events ask just the person registering.
 */
export function contactError(
  form: SignupFormConfig,
  memberIndex: number,
  member: { name: string; email?: string | null; phone?: string | null },
): string | null {
  const applies = form.contactScope === "everyone" || memberIndex === 0;
  if (!applies) return null;
  const who = memberIndex === 0 ? "" : ` for ${member.name}`;
  if (form.email === "required" && !member.email?.trim()) {
    return `An email address is required${who}.`;
  }
  if (form.phone === "required" && !member.phone?.trim()) {
    return `A phone number is required${who}.`;
  }
  return null;
}

/** Blank question of a type, ready for the builder. */
export function newQuestion(
  type: QuestionType,
  scope: QuestionScope = "team",
): FormQuestion {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10),
    label: "",
    type,
    required: type === "consent",
    scope,
    ...(type === "choice" || type === "multi_choice"
      ? { options: ["Option 1"] }
      : {}),
  };
}
