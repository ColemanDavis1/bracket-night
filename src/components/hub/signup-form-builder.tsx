"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QuestionFields } from "@/components/signup-questions";
import {
  MAX_OPTIONS,
  MAX_QUESTIONS,
  QUESTION_TYPE_LABELS,
  YES,
  newQuestion,
  questionsFor,
  type AnswerMap,
  type FieldRule,
  type FormQuestion,
  type QuestionScope,
  type QuestionType,
  type SignupFormConfig,
} from "@/lib/signup/form-schema";
import { updateSignupForm } from "@/lib/actions/tournaments";

const RULE_LABELS: Record<FieldRule, string> = {
  off: "Don't ask",
  optional: "Optional",
  required: "Required",
};

/** <input type="datetime-local"> works in local time; config stores UTC ISO. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Build the sign-up form for a large event: contact rules, a close time, and
 * any number of custom questions. Team-scope questions are asked once of the
 * captain; person-scope questions are asked of every member on the roster.
 */
export function SignupFormBuilder({
  tournamentId,
  form,
  teamSize,
  teamMode,
}: {
  tournamentId: string;
  form: SignupFormConfig;
  teamSize: { target: number; min: number; max: number } | null;
  teamMode: boolean;
}) {
  const [draft, setDraft] = useState<SignupFormConfig>(form);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<AnswerMap>({});

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(form),
    [draft, form],
  );

  function patch(next: Partial<SignupFormConfig>) {
    setSaved(false);
    setDraft((prev) => ({ ...prev, ...next }));
  }

  function patchQuestion(id: string, next: Partial<FormQuestion>) {
    setSaved(false);
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === id ? { ...q, ...next } : q,
      ),
    }));
  }

  function addQuestion(scope: QuestionScope) {
    setSaved(false);
    setDraft((prev) => ({
      ...prev,
      questions: [...prev.questions, newQuestion("short_text", scope)],
    }));
  }

  function removeQuestion(id: string) {
    setSaved(false);
    setDraft((prev) => ({
      ...prev,
      // Anything conditional on the removed question loses its trigger.
      questions: prev.questions
        .filter((q) => q.id !== id)
        .map((q) => (q.showIf?.questionId === id ? { ...q, showIf: undefined } : q)),
    }));
  }

  function move(id: string, delta: number) {
    setSaved(false);
    setDraft((prev) => {
      const list = [...prev.questions];
      const i = list.findIndex((q) => q.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return prev;
      [list[i], list[j]] = [list[j]!, list[i]!];
      return { ...prev, questions: list };
    });
  }

  function save() {
    const unlabelled = draft.questions.some((q) => !q.label.trim());
    if (unlabelled) {
      setError("Every question needs a label — unlabelled ones are dropped.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await updateSignupForm(tournamentId, draft);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the form.");
      }
    });
  }

  const teamQuestions = questionsFor(draft, "team");
  const personQuestions = questionsFor(draft, "person");
  const full = draft.questions.length >= MAX_QUESTIONS;

  return (
    <section className="space-y-5 rounded-xl border border-border p-4">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          Sign-up form
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Everything here appears on the public sign-up link and QR code.
          Responses are stored with each person and exportable as a spreadsheet.
        </p>
      </div>

      <Field label="Intro shown at the top of the form">
        <textarea
          value={draft.intro ?? ""}
          onChange={(e) => patch({ intro: e.target.value || null })}
          rows={2}
          placeholder="e.g. Doors at 6. Bring your student ID."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Email address">
          <RuleSelect
            value={draft.email}
            onChange={(v) => patch({ email: v })}
            disabled={pending}
          />
        </Field>
        <Field label="Phone number">
          <RuleSelect
            value={draft.phone}
            onChange={(v) => patch({ phone: v })}
            disabled={pending}
          />
        </Field>
        {teamMode ? (
          <Field label="Ask contact details of">
            <Select
              value={draft.contactScope}
              disabled={pending}
              onValueChange={(v) =>
                patch({ contactScope: v as "captain" | "everyone" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="captain">The captain only</SelectItem>
                <SelectItem value="everyone">Every member</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sign-ups close at">
          <Input
            type="datetime-local"
            value={isoToLocalInput(draft.closesAt)}
            onChange={(e) => patch({ closesAt: localInputToIso(e.target.value) })}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Leave blank to stay open. After it passes you can still add people by
            hand on this tab.
          </p>
        </Field>
        {teamMode ? (
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.requireMinRoster}
                onChange={(e) => patch({ requireMinRoster: e.target.checked })}
              />
              Require a full roster at sign-up
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              {teamSize
                ? `Teams must name ${teamSize.min}–${teamSize.max} players to submit. Change the range under Team size in Settings.`
                : "Teams must name a full roster to submit."}
            </p>
          </div>
        ) : null}
      </div>

      <QuestionGroup
        title={teamMode ? "Questions asked once per team" : "Questions"}
        desc={
          teamMode
            ? "Answered by whoever registers the team."
            : "Answered by each person signing up."
        }
        questions={teamMode ? teamQuestions : draft.questions}
        allQuestions={draft.questions}
        disabled={pending}
        full={full}
        onAdd={() => addQuestion(teamMode ? "team" : "person")}
        onPatch={patchQuestion}
        onRemove={removeQuestion}
        onMove={move}
      />

      {teamMode ? (
        <QuestionGroup
          title="Questions asked of every member"
          desc="Repeated for each person on the roster."
          questions={personQuestions}
          allQuestions={draft.questions}
          disabled={pending}
          full={full}
          onAdd={() => addQuestion("person")}
          onPatch={patchQuestion}
          onRemove={removeQuestion}
          onMove={move}
        />
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending || !dirty} onClick={save}>
          <Save className="h-4 w-4" />
          {pending ? "Saving…" : "Save form"}
        </Button>
        <Button
          variant="outline"
          disabled={pending || !dirty}
          onClick={() => {
            setDraft(form);
            setError(null);
            setSaved(false);
          }}
        >
          <RotateCcw className="h-4 w-4" /> Discard
        </Button>
        <Button variant="ghost" onClick={() => setShowPreview((v) => !v)}>
          <Eye className="h-4 w-4" /> {showPreview ? "Hide" : "Preview"}
        </Button>
        {saved && !dirty ? (
          <span className="text-sm text-broadcast-green">Form saved.</span>
        ) : null}
      </div>

      {showPreview ? (
        <div className="rounded-lg border border-dashed border-border p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Preview — this is what players see
          </p>
          {draft.intro ? (
            <p className="mb-3 whitespace-pre-wrap text-sm text-muted-foreground">
              {draft.intro}
            </p>
          ) : null}
          {draft.questions.length ? (
            <QuestionFields
              questions={draft.questions.filter((q) => q.label.trim())}
              answers={previewAnswers}
              idPrefix="preview"
              onChange={(id, value) =>
                setPreviewAnswers((prev) => ({ ...prev, [id]: value }))
              }
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No custom questions yet — the form asks for names and contact
              details only.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function QuestionGroup({
  title,
  desc,
  questions,
  allQuestions,
  disabled,
  full,
  onAdd,
  onPatch,
  onRemove,
  onMove,
}: {
  title: string;
  desc: string;
  questions: FormQuestion[];
  allQuestions: FormQuestion[];
  disabled: boolean;
  full: boolean;
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<FormQuestion>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: number) => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
        <Button size="sm" variant="outline" disabled={disabled || full} onClick={onAdd}>
          <Plus className="h-4 w-4" /> Add question
        </Button>
      </div>

      {questions.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No questions yet.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {questions.map((q) => (
            <li key={q.id}>
              <QuestionEditor
                question={q}
                allQuestions={allQuestions}
                disabled={disabled}
                onPatch={(p) => onPatch(q.id, p)}
                onRemove={() => onRemove(q.id)}
                onMove={(d) => onMove(q.id, d)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuestionEditor({
  question,
  allQuestions,
  disabled,
  onPatch,
  onRemove,
  onMove,
}: {
  question: FormQuestion;
  allQuestions: FormQuestion[];
  disabled: boolean;
  onPatch: (patch: Partial<FormQuestion>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const hasOptions =
    question.type === "choice" || question.type === "multi_choice";
  // A follow-up can hang off any earlier question with a fixed answer set.
  const triggers = allQuestions.filter(
    (q) =>
      q.id !== question.id &&
      q.scope === question.scope &&
      (q.type === "yes_no" || q.type === "choice"),
  );
  const trigger = triggers.find((t) => t.id === question.showIf?.questionId);
  const triggerOptions =
    trigger?.type === "yes_no" ? [YES, "No"] : (trigger?.options ?? []);

  return (
    <div className="rounded-lg border border-border/70 p-3">
      <div className="flex items-start gap-2">
        <Input
          value={question.label}
          disabled={disabled}
          placeholder="Question text, e.g. Which dorm (if any)?"
          onChange={(e) => onPatch({ label: e.target.value })}
        />
        <div className="flex shrink-0">
          <button
            type="button"
            aria-label="Move up"
            className="p-1 text-muted-foreground hover:text-foreground"
            disabled={disabled}
            onClick={() => onMove(-1)}
          >
            <ChevronUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Move down"
            className="p-1 text-muted-foreground hover:text-foreground"
            disabled={disabled}
            onClick={() => onMove(1)}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Delete question"
            className="p-1 text-muted-foreground hover:text-destructive"
            disabled={disabled}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select
          value={question.type}
          disabled={disabled}
          onValueChange={(v) => {
            const type = v as QuestionType;
            onPatch({
              type,
              options:
                type === "choice" || type === "multi_choice"
                  ? (question.options ?? ["Option 1"])
                  : undefined,
            });
          }}
        >
          <SelectTrigger className="h-8 w-52 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {QUESTION_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={question.required}
            disabled={disabled}
            onChange={(e) => onPatch({ required: e.target.checked })}
          />
          Required
        </label>

        <Input
          value={question.help ?? ""}
          disabled={disabled}
          placeholder="Help text (optional)"
          className="h-8 flex-1 text-xs"
          onChange={(e) => onPatch({ help: e.target.value || undefined })}
        />
      </div>

      {hasOptions ? (
        <OptionEditor
          options={question.options ?? []}
          disabled={disabled}
          onChange={(options) => onPatch({ options })}
        />
      ) : null}

      {triggers.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Only show when</span>
          <Select
            value={question.showIf?.questionId ?? "__always__"}
            disabled={disabled}
            onValueChange={(v) =>
              onPatch({
                showIf:
                  v === "__always__"
                    ? undefined
                    : { questionId: v, equals: YES },
              })
            }
          >
            <SelectTrigger className="h-7 w-52 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__always__">Always show</SelectItem>
              {triggers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label || "Untitled question"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {question.showIf && triggerOptions.length ? (
            <>
              <span className="text-muted-foreground">is</span>
              <Select
                value={question.showIf.equals}
                disabled={disabled}
                onValueChange={(v) =>
                  onPatch({
                    showIf: { questionId: question.showIf!.questionId, equals: v },
                  })
                }
              >
                <SelectTrigger className="h-7 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {triggerOptions.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function OptionEditor({
  options,
  disabled,
  onChange,
}: {
  options: string[];
  disabled: boolean;
  onChange: (options: string[]) => void;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      {options.map((o, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={o}
            disabled={disabled}
            className="h-8 text-xs"
            onChange={(e) =>
              onChange(options.map((v, idx) => (idx === i ? e.target.value : v)))
            }
          />
          <button
            type="button"
            aria-label={`Remove option ${i + 1}`}
            className="text-muted-foreground hover:text-destructive"
            disabled={disabled || options.length <= 1}
            onClick={() => onChange(options.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled || options.length >= MAX_OPTIONS}
        onClick={() => onChange([...options, `Option ${options.length + 1}`])}
      >
        <Plus className="h-4 w-4" /> Add option
      </Button>
    </div>
  );
}

function RuleSelect({
  value,
  onChange,
  disabled,
}: {
  value: FieldRule;
  onChange: (value: FieldRule) => void;
  disabled: boolean;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(v) => onChange(v as FieldRule)}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(RULE_LABELS) as FieldRule[]).map((r) => (
          <SelectItem key={r} value={r}>
            {RULE_LABELS[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
