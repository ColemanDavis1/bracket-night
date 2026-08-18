"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { submitSignup } from "@/lib/actions/tournaments";
import { DEFAULT_TEAM_SIZE, type TeamSizeConfig } from "@/lib/teams/sizes";
import {
  allowedSignupTypes,
  signupModeHint,
  type SignupMode,
} from "@/lib/teams/signup-mode";
import {
  contactError,
  describeAnswerErrors,
  questionsFor,
  rosterSizeError,
  validateAnswers,
  type AnswerMap,
  type AnswerValue,
  type SignupFormConfig,
} from "@/lib/signup/form-schema";
import { QuestionFields } from "@/components/signup-questions";

interface Member {
  name: string;
  email: string;
  phone: string;
  answers: AnswerMap;
}

const empty = (): Member => ({ name: "", email: "", phone: "", answers: {} });

/**
 * Public sign-up form, designed for someone filling it out on a phone in a
 * hallway. Up to two paths: register a full team, or join solo to be placed on
 * a team — whichever the organizer allows. The organizer's custom questions are
 * rendered alongside the built-in contact fields, and the same pure validators
 * run here and in the server action.
 */
export function SignupForm({
  tournamentId,
  teamSize,
  signupMode,
  form,
}: {
  tournamentId: string;
  teamSize: TeamSizeConfig | null;
  signupMode: SignupMode;
  form: SignupFormConfig;
}) {
  const size = teamSize ?? DEFAULT_TEAM_SIZE;
  const paths = allowedSignupTypes(signupMode);
  const [mode, setMode] = useState<"team" | "solo">(paths[0] ?? "team");
  const [teamName, setTeamName] = useState("");
  // A required minimum roster starts with that many blank member cards, so the
  // ask is obvious before anyone begins typing.
  const [members, setMembers] = useState<Member[]>(() =>
    form.requireMinRoster
      ? Array.from({ length: Math.max(1, size.min) }, empty)
      : [empty()],
  );
  const [solo, setSolo] = useState<Member>(empty());
  const [teamAnswers, setTeamAnswers] = useState<AnswerMap>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const teamQuestions = useMemo(() => questionsFor(form, "team"), [form]);
  const personQuestions = useMemo(() => questionsFor(form, "person"), [form]);

  function updateMember(i: number, patch: Partial<Member>) {
    setMembers((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  function setMemberAnswer(i: number, questionId: string, value: AnswerValue) {
    setMembers((prev) =>
      prev.map((m, idx) =>
        idx === i ? { ...m, answers: { ...m.answers, [questionId]: value } } : m,
      ),
    );
  }

  /** Same checks the server runs, so problems surface before a round trip. */
  function firstProblem(people: Member[]): string | null {
    if (mode === "team") {
      if (!teamName.trim()) return "Team name is required.";
      const roster = rosterSizeError(people.length, size, form.requireMinRoster);
      if (roster) return roster;
      const teamErrors = validateAnswers(teamQuestions, teamAnswers);
      if (teamErrors.length) return describeAnswerErrors(teamQuestions, teamErrors);
    }
    for (const [i, m] of people.entries()) {
      const contact = contactError(form, i, m);
      if (contact) return contact;
      const errors = validateAnswers(personQuestions, m.answers);
      if (errors.length) return describeAnswerErrors(personQuestions, errors);
    }
    return null;
  }

  function submit() {
    setError(null);
    const people =
      mode === "team" ? members.filter((m) => m.name.trim()) : [solo];
    if (!people.length || !people[0]!.name.trim()) {
      return setError("Please enter at least one name.");
    }

    const problem = firstProblem(people);
    if (problem) return setError(problem);

    startTransition(async () => {
      try {
        await submitSignup({
          tournamentId,
          mode,
          teamName: mode === "team" ? teamName : undefined,
          members: people.map((m) => ({
            name: m.name,
            email: m.email,
            phone: m.phone,
            answers: m.answers,
          })),
          answers: mode === "team" ? teamAnswers : undefined,
        });
        setDone(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not submit sign-up.");
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-broadcast-green" />
        <h2 className="mt-3 text-lg font-bold">You&apos;re on the list!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The organizer will confirm your {mode === "team" ? "team" : "spot"} at
          check-in. See you at the event.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => {
            setDone(false);
            setTeamName("");
            setMembers(
              form.requireMinRoster
                ? Array.from({ length: Math.max(1, size.min) }, empty)
                : [empty()],
            );
            setSolo(empty());
            setTeamAnswers({});
            setMode(paths[0] ?? "team");
          }}
        >
          Sign up someone else
        </Button>
      </div>
    );
  }

  const rosterFull = members.length >= size.max;
  const named = members.filter((m) => m.name.trim()).length;
  const canSubmit =
    mode === "team" ? teamName.trim() && named > 0 : solo.name.trim();

  return (
    <div className="space-y-4">
      {form.intro ? (
        <p className="whitespace-pre-wrap rounded-xl border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground">
          {form.intro}
        </p>
      ) : null}

      {paths.length > 1 ? (
        <div className="grid grid-cols-2 gap-2">
          <ModeButton
            active={mode === "team"}
            onClick={() => setMode("team")}
            icon={<Users className="h-4 w-4" />}
            label="Register a full team"
          />
          <ModeButton
            active={mode === "solo"}
            onClick={() => setMode("solo")}
            icon={<UserPlus className="h-4 w-4" />}
            label="Join as a solo player"
          />
        </div>
      ) : (
        // Only one path is open: state it plainly instead of showing a toggle
        // with nothing to toggle to.
        <p className="flex items-start gap-2 rounded-xl border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground">
          {mode === "team" ? (
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          ) : (
            <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          )}
          {signupModeHint(signupMode)}
        </p>
      )}

      {mode === "team" ? (
        <div className="space-y-4 rounded-xl border border-border p-4">
          <div>
            <Label htmlFor="team-name">
              Team name<span className="ml-1 text-destructive">*</span>
            </Label>
            <Input
              id="team-name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. The Ballers"
              className="mt-1"
            />
          </div>

          {teamQuestions.length ? (
            <div className="rounded-lg border border-border/70 p-3">
              <QuestionFields
                questions={teamQuestions}
                answers={teamAnswers}
                idPrefix="team"
                onChange={(id, value) =>
                  setTeamAnswers((prev) => ({ ...prev, [id]: value }))
                }
              />
            </div>
          ) : null}

          <div className="space-y-3">
            {members.map((m, i) => (
              <div key={i} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {i === 0 ? "Captain (you)" : `Teammate ${i}`}
                  </span>
                  {i > 0 ? (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setMembers((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      aria-label="Remove teammate"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <Input
                  value={m.name}
                  onChange={(e) => updateMember(i, { name: e.target.value })}
                  placeholder="Full name"
                  className="mt-2"
                />
                <ContactFields
                  form={form}
                  index={i}
                  member={m}
                  onChange={(patch) => updateMember(i, patch)}
                />
                {personQuestions.length ? (
                  <div className="mt-3">
                    <QuestionFields
                      questions={personQuestions}
                      answers={m.answers}
                      idPrefix={`m${i}`}
                      onChange={(id, value) => setMemberAnswer(i, id, value)}
                    />
                  </div>
                ) : null}
              </div>
            ))}
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={rosterFull}
                onClick={() => setMembers((prev) => [...prev, empty()])}
              >
                <Plus className="h-4 w-4" /> Add teammate
              </Button>
              <span className="text-xs font-semibold text-muted-foreground">
                {named} of {size.max} players
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {form.requireMinRoster
              ? `This event needs ${size.min}–${size.max} players per team, all named at sign-up.`
              : rosterFull
                ? `This event caps teams at ${size.max} players, so that's a full roster.`
                : `Teams can have up to ${size.max} players (${size.min} minimum, target ${size.target}).`}
          </p>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div>
            <Label htmlFor="solo-name">
              Your name<span className="ml-1 text-destructive">*</span>
            </Label>
            <Input
              id="solo-name"
              value={solo.name}
              onChange={(e) => setSolo({ ...solo, name: e.target.value })}
              placeholder="Full name"
              className="mt-1"
            />
          </div>
          <ContactFields
            form={form}
            index={0}
            member={solo}
            onChange={(patch) => setSolo({ ...solo, ...patch })}
          />
          {personQuestions.length ? (
            <QuestionFields
              questions={personQuestions}
              answers={solo.answers}
              idPrefix="solo"
              onChange={(id, value) =>
                setSolo((prev) => ({
                  ...prev,
                  answers: { ...prev.answers, [id]: value },
                }))
              }
            />
          ) : null}
          <p className="text-xs text-muted-foreground">
            We&apos;ll place you on a team when you arrive.
          </p>
        </div>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button
        className="w-full"
        size="lg"
        disabled={pending || !canSubmit}
        onClick={submit}
      >
        {pending ? "Submitting…" : "Submit sign-up"}
      </Button>
    </div>
  );
}

/** Built-in email / phone, shown per the organizer's contact rules. */
function ContactFields({
  form,
  index,
  member,
  onChange,
}: {
  form: SignupFormConfig;
  index: number;
  member: Member;
  onChange: (patch: Partial<Member>) => void;
}) {
  const asked = form.contactScope === "everyone" || index === 0;
  const showEmail = asked && form.email !== "off";
  const showPhone = asked && form.phone !== "off";
  if (!showEmail && !showPhone) return null;

  const suffix = (rule: string) => (rule === "required" ? " *" : " (optional)");

  return (
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {showEmail ? (
        <Input
          value={member.email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder={`Email${suffix(form.email)}`}
          type="email"
        />
      ) : null}
      {showPhone ? (
        <Input
          value={member.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          placeholder={`Phone${suffix(form.phone)}`}
          type="tel"
        />
      ) : null}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center text-sm font-medium transition",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:border-primary/50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
