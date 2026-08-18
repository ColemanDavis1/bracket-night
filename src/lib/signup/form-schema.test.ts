import { describe, expect, it } from "vitest";
import {
  AGREED,
  contactError,
  defaultSignupForm,
  describeAnswerErrors,
  formClosed,
  isQuestionVisible,
  normalizeSignupForm,
  questionsFor,
  rosterSizeError,
  sanitizeAnswers,
  validateAnswers,
  type FormQuestion,
  type SignupFormConfig,
} from "./form-schema";

/**
 * The worked example: team-only sign-up, 6-8 players, a required Bible-study
 * question with a follow-up that only appears on "Yes", and an optional dorm
 * question asked of every member.
 */
const bibleStudy: FormQuestion = {
  id: "bs",
  label: "Are any members interested in a Bible study?",
  type: "yes_no",
  required: true,
  scope: "team",
};
const whichOnes: FormQuestion = {
  id: "bs_who",
  label: "Which members?",
  type: "short_text",
  required: true,
  scope: "team",
  showIf: { questionId: "bs", equals: "Yes" },
};
const dorm: FormQuestion = {
  id: "dorm",
  label: "Which dorm (if any)?",
  type: "short_text",
  required: false,
  scope: "person",
};

const form: SignupFormConfig = {
  ...defaultSignupForm(),
  email: "required",
  phone: "required",
  requireMinRoster: true,
  questions: [bibleStudy, whichOnes, dorm],
};

describe("questionsFor", () => {
  it("splits team questions from per-person questions", () => {
    expect(questionsFor(form, "team").map((q) => q.id)).toEqual(["bs", "bs_who"]);
    expect(questionsFor(form, "person").map((q) => q.id)).toEqual(["dorm"]);
  });
});

describe("isQuestionVisible", () => {
  it("hides a follow-up until its trigger matches", () => {
    expect(isQuestionVisible(whichOnes, {})).toBe(false);
    expect(isQuestionVisible(whichOnes, { bs: "No" })).toBe(false);
    expect(isQuestionVisible(whichOnes, { bs: "Yes" })).toBe(true);
  });

  it("matches inside a multi-select trigger", () => {
    expect(isQuestionVisible(whichOnes, { bs: ["No", "Yes"] })).toBe(true);
  });

  it("always shows an unconditional question", () => {
    expect(isQuestionVisible(bibleStudy, {})).toBe(true);
  });
});

describe("validateAnswers", () => {
  const teamQuestions = questionsFor(form, "team");

  it("flags a missing required answer", () => {
    expect(validateAnswers(teamQuestions, {})).toEqual([
      { questionId: "bs", message: "This question is required." },
    ]);
  });

  it("does not require a hidden follow-up", () => {
    expect(validateAnswers(teamQuestions, { bs: "No" })).toEqual([]);
  });

  it("requires the follow-up once it is showing", () => {
    const errors = validateAnswers(teamQuestions, { bs: "Yes" });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.questionId).toBe("bs_who");
  });

  it("passes a complete submission", () => {
    expect(
      validateAnswers(teamQuestions, { bs: "Yes", bs_who: "Sam and Alex" }),
    ).toEqual([]);
  });

  it("ignores a blank optional answer", () => {
    expect(validateAnswers(questionsFor(form, "person"), {})).toEqual([]);
  });

  it("rejects a yes_no that is neither", () => {
    const errors = validateAnswers([bibleStudy], { bs: "Maybe" });
    expect(errors[0]!.message).toBe("Choose Yes or No.");
  });

  it("checks choice answers against the option list", () => {
    const q: FormQuestion = {
      id: "c",
      label: "Shirt size",
      type: "choice",
      required: true,
      scope: "person",
      options: ["S", "M", "L"],
    };
    expect(validateAnswers([q], { c: "M" })).toEqual([]);
    expect(validateAnswers([q], { c: "XXL" })[0]!.message).toBe(
      "Pick from the list.",
    );
  });

  it("validates email shape", () => {
    const q: FormQuestion = {
      id: "e",
      label: "Backup email",
      type: "email",
      required: true,
      scope: "person",
    };
    expect(validateAnswers([q], { e: "a@b.co" })).toEqual([]);
    expect(validateAnswers([q], { e: "nope" })[0]!.message).toContain("valid email");
  });
});

describe("sanitizeAnswers", () => {
  it("drops answers to questions that do not exist", () => {
    const clean = sanitizeAnswers(questionsFor(form, "team"), {
      bs: "No",
      injected: "should not persist",
    });
    expect(clean).toEqual({ bs: "No" });
  });

  it("drops answers to hidden questions", () => {
    const clean = sanitizeAnswers(questionsFor(form, "team"), {
      bs: "No",
      bs_who: "stale value from before they changed their mind",
    });
    expect(clean.bs_who).toBeUndefined();
  });

  it("trims, caps length, and drops blanks", () => {
    const clean = sanitizeAnswers([dorm], { dorm: `  ${"x".repeat(500)}  ` });
    expect((clean.dorm as string).length).toBe(200);
    expect(sanitizeAnswers([dorm], { dorm: "   " })).toEqual({});
  });

  it("keeps multi-select values as a list", () => {
    const q: FormQuestion = {
      id: "m",
      label: "Nights free",
      type: "multi_choice",
      required: false,
      scope: "person",
      options: ["Mon", "Tue"],
    };
    expect(sanitizeAnswers([q], { m: ["Mon", " Tue "] })).toEqual({
      m: ["Mon", "Tue"],
    });
  });
});

describe("rosterSizeError", () => {
  const size = { min: 6, max: 8 };

  it("accepts a roster inside the range", () => {
    expect(rosterSizeError(6, size, true)).toBeNull();
    expect(rosterSizeError(8, size, true)).toBeNull();
  });

  it("rejects an over-max roster whatever the min rule", () => {
    expect(rosterSizeError(9, size, false)).toBe(
      "Teams can have at most 8 players.",
    );
  });

  it("rejects a short roster only when a full one is required", () => {
    expect(rosterSizeError(4, size, true)).toBe(
      "This event needs at least 6 players per team — add 2 more.",
    );
    expect(rosterSizeError(4, size, false)).toBeNull();
  });
});

describe("formClosed", () => {
  it("never closes without a close time", () => {
    expect(formClosed(defaultSignupForm(), new Date())).toBe(false);
  });

  it("closes once the moment passes", () => {
    const f = { ...defaultSignupForm(), closesAt: "2026-09-12T23:00:00.000Z" };
    expect(formClosed(f, new Date("2026-09-12T22:59:00.000Z"))).toBe(false);
    expect(formClosed(f, new Date("2026-09-12T23:00:01.000Z"))).toBe(true);
  });

  it("treats an unparseable close time as open", () => {
    const f = { ...defaultSignupForm(), closesAt: "not a date" };
    expect(formClosed(f, new Date())).toBe(false);
  });
});

describe("normalizeSignupForm", () => {
  it("falls back to defaults for junk", () => {
    expect(normalizeSignupForm(null)).toEqual(defaultSignupForm());
    expect(normalizeSignupForm("nope")).toEqual(defaultSignupForm());
  });

  it("drops unlabelled questions and keeps the rest", () => {
    const out = normalizeSignupForm({
      questions: [{ label: "", type: "short_text" }, { label: "Dorm" }],
    });
    expect(out.questions).toHaveLength(1);
    expect(out.questions[0]!.label).toBe("Dorm");
    expect(out.questions[0]!.type).toBe("short_text");
  });

  it("round-trips a real form", () => {
    expect(normalizeSignupForm(form)).toEqual(form);
  });
});

describe("describeAnswerErrors", () => {
  it("names the question that failed", () => {
    const errors = validateAnswers(questionsFor(form, "team"), {});
    expect(describeAnswerErrors(form.questions, errors)).toBe(
      "Are any members interested in a Bible study?: This question is required.",
    );
  });

  it("is empty when nothing failed", () => {
    expect(describeAnswerErrors(form.questions, [])).toBe("");
  });
});

describe("contactError", () => {
  const captainOnly = { ...form, email: "required" as const, phone: "required" as const };

  it("requires the captain's contact details", () => {
    expect(contactError(captainOnly, 0, { name: "Bob" })).toBe(
      "An email address is required.",
    );
    expect(
      contactError(captainOnly, 0, { name: "Bob", email: "b@x.co" }),
    ).toBe("A phone number is required.");
    expect(
      contactError(captainOnly, 0, { name: "Bob", email: "b@x.co", phone: "555" }),
    ).toBeNull();
  });

  it("leaves teammates alone when only the captain is asked", () => {
    expect(contactError(captainOnly, 2, { name: "Carol" })).toBeNull();
  });

  it("names the teammate when everyone is asked", () => {
    const everyone = { ...captainOnly, contactScope: "everyone" as const };
    expect(contactError(everyone, 2, { name: "Carol" })).toBe(
      "An email address is required for Carol.",
    );
  });

  it("ignores optional and off fields", () => {
    const relaxed = { ...form, email: "optional" as const, phone: "off" as const };
    expect(contactError(relaxed, 0, { name: "Bob" })).toBeNull();
  });
});

describe("consent questions", () => {
  const waiver: FormQuestion = {
    id: "waiver",
    label: "I agree to the intramural participation waiver.",
    type: "consent",
    required: true,
    scope: "person",
  };

  it("blocks submission until it is accepted", () => {
    expect(validateAnswers([waiver], {})[0]!.message).toBe(
      "You must accept this to sign up.",
    );
    expect(validateAnswers([waiver], { waiver: "" })[0]!.message).toBe(
      "You must accept this to sign up.",
    );
  });

  it("passes once accepted", () => {
    expect(validateAnswers([waiver], { waiver: AGREED })).toEqual([]);
  });

  it("rejects any value other than acceptance", () => {
    expect(validateAnswers([waiver], { waiver: "Nope" })[0]!.message).toBe(
      "You must accept this to sign up.",
    );
  });

  it("is always required, whatever the stored config claims", () => {
    const out = normalizeSignupForm({
      questions: [{ ...waiver, required: false }],
    });
    expect(out.questions[0]!.required).toBe(true);
  });

  it("stores a readable value for the export", () => {
    expect(sanitizeAnswers([waiver], { waiver: AGREED })).toEqual({
      waiver: AGREED,
    });
  });
});

describe("date, time, and link questions", () => {
  const q = (type: FormQuestion["type"]): FormQuestion => ({
    id: "x",
    label: "When",
    type,
    required: false,
    scope: "person",
  });

  it("accepts what the native pickers produce", () => {
    expect(validateAnswers([q("date")], { x: "2026-09-12" })).toEqual([]);
    expect(validateAnswers([q("time")], { x: "18:30" })).toEqual([]);
    expect(validateAnswers([q("time")], { x: "18:30:00" })).toEqual([]);
  });

  it("rejects a date that is not one", () => {
    expect(validateAnswers([q("date")], { x: "next tuesday" })[0]!.message).toBe(
      "Enter a date.",
    );
  });

  it("takes a bare domain as a link", () => {
    expect(validateAnswers([q("url")], { x: "instagram.com/team" })).toEqual([]);
    expect(validateAnswers([q("url")], { x: "https://x.co" })).toEqual([]);
    expect(validateAnswers([q("url")], { x: "not a link" })[0]!.message).toBe(
      "Enter a link.",
    );
  });
});
