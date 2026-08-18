import { describe, expect, it } from "vitest";
import { defaultSignupForm, type SignupFormConfig } from "./form-schema";
import { responseHeaders, signupResponsesCsv, type ExportPerson } from "./export";

const form: SignupFormConfig = {
  ...defaultSignupForm(),
  questions: [
    {
      id: "bs",
      label: "Are any members interested in a Bible study?",
      type: "yes_no",
      required: true,
      scope: "team",
    },
    {
      id: "dorm",
      label: "Which dorm (if any)?",
      type: "short_text",
      required: false,
      scope: "person",
    },
  ],
};

const person = (over: Partial<ExportPerson>): ExportPerson => ({
  name: "Someone",
  email: null,
  phone: null,
  teamName: null,
  isCaptain: false,
  signupType: "solo",
  status: "approved",
  source: "native",
  checkedIn: false,
  answers: {},
  ...over,
});

describe("responseHeaders", () => {
  it("puts fixed columns first, then team questions, then person questions", () => {
    expect(responseHeaders(form)).toEqual([
      "Team",
      "Role",
      "Name",
      "Email",
      "Phone",
      "Status",
      "Source",
      "Checked in",
      "Are any members interested in a Bible study?",
      "Which dorm (if any)?",
    ]);
  });
});

describe("signupResponsesCsv", () => {
  it("repeats the captain's team answers on every member row", () => {
    const csv = signupResponsesCsv("Game Night", form, [
      person({
        name: "Bob",
        teamName: "Bob Squad",
        isCaptain: true,
        signupType: "team",
        answers: { bs: "Yes", dorm: "Hinton James" },
      }),
      person({
        name: "Carol",
        teamName: "Bob Squad",
        signupType: "team",
        answers: { dorm: "Craige" },
      }),
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[2]).toBe(
      "Bob Squad,Captain,Bob,,,approved,native,No,Yes,Hinton James",
    );
    // Carol did not answer the team question; she inherits Bob's answer.
    expect(lines[3]).toBe("Bob Squad,Member,Carol,,,approved,native,No,Yes,Craige");
  });

  it("labels solo sign-ups and keeps their own answers", () => {
    const csv = signupResponsesCsv("Game Night", form, [
      person({ name: "Alice", answers: { dorm: "Ehringhaus" } }),
    ]);
    expect(csv).toContain(",Solo,Alice,");
    expect(csv.trim().split("\n")[2]).toContain("Ehringhaus");
  });

  it("joins multi-select answers into one cell", () => {
    const multi: SignupFormConfig = {
      ...defaultSignupForm(),
      questions: [
        {
          id: "n",
          label: "Nights free",
          type: "multi_choice",
          required: false,
          scope: "person",
          options: ["Mon", "Tue"],
        },
      ],
    };
    const csv = signupResponsesCsv("Game Night", multi, [
      person({ name: "Alice", answers: { n: ["Mon", "Tue"] } }),
    ]);
    expect(csv).toContain("Mon; Tue");
  });

  it("quotes cells containing commas or quotes", () => {
    const csv = signupResponsesCsv("Game Night", form, [
      person({ name: 'Alice "Ace", Jr.' }),
    ]);
    expect(csv).toContain('"Alice ""Ace"", Jr."');
  });

  it("emits a header row even with no responses", () => {
    const csv = signupResponsesCsv("Game Night", form, []);
    expect(csv.trim().split("\n")).toHaveLength(2);
  });
});
