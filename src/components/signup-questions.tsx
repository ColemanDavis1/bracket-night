"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AGREED,
  NO,
  YES,
  visibleQuestions,
  type AnswerMap,
  type AnswerValue,
  type FormQuestion,
} from "@/lib/signup/form-schema";

/**
 * Renders a set of custom questions against an answer map. Used by the public
 * sign-up form for both scopes (once for the team, once per member) and by the
 * builder's live preview, so what the organizer previews is literally what the
 * player fills in.
 */
export function QuestionFields({
  questions,
  answers,
  onChange,
  disabled,
  idPrefix,
}: {
  questions: readonly FormQuestion[];
  answers: AnswerMap;
  onChange: (questionId: string, value: AnswerValue) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const shown = visibleQuestions(questions, answers);
  if (!shown.length) return null;

  return (
    <div className="space-y-4">
      {shown.map((q) => {
        const id = `${idPrefix}-${q.id}`;
        const value = answers[q.id];
        if (q.type === "consent") {
          return (
            <div key={q.id} className="rounded-lg border border-border/70 p-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={value === AGREED}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(q.id, e.target.checked ? AGREED : "")
                  }
                />
                <span>
                  {q.label}
                  <span className="ml-1 text-destructive" aria-hidden>
                    *
                  </span>
                  {q.help ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {q.help}
                    </span>
                  ) : null}
                </span>
              </label>
            </div>
          );
        }

        return (
          <div key={q.id}>
            <Label htmlFor={id}>
              {q.label}
              {q.required ? (
                <span className="ml-1 text-destructive" aria-hidden>
                  *
                </span>
              ) : (
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  (optional)
                </span>
              )}
            </Label>
            {q.help ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{q.help}</p>
            ) : null}
            <div className="mt-1.5">
              <QuestionInput
                id={id}
                question={q}
                value={value}
                disabled={disabled}
                onChange={(v) => onChange(q.id, v)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuestionInput({
  id,
  question,
  value,
  disabled,
  onChange,
}: {
  id: string;
  question: FormQuestion;
  value: AnswerValue | undefined;
  disabled?: boolean;
  onChange: (value: AnswerValue) => void;
}) {
  const text = typeof value === "string" ? value : "";

  switch (question.type) {
    case "paragraph":
      return (
        <textarea
          id={id}
          value={text}
          disabled={disabled}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      );

    case "yes_no":
      return (
        <div className="flex gap-2">
          {[YES, NO].map((option) => (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option)}
              className={`rounded-md border px-4 py-2 text-sm font-medium transition ${
                text === option
                  ? "border-primary bg-primary/10"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      );

    case "choice":
      return (
        <Select
          value={text || undefined}
          disabled={disabled}
          onValueChange={onChange}
        >
          <SelectTrigger id={id}>
            <SelectValue placeholder="Choose one…" />
          </SelectTrigger>
          <SelectContent>
            {(question.options ?? []).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "multi_choice": {
      const picked = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1.5">
          {(question.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={picked.includes(o)}
                disabled={disabled}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...picked, o]
                      : picked.filter((p) => p !== o),
                  )
                }
              />
              {o}
            </label>
          ))}
        </div>
      );
    }

    default:
      return (
        <Input
          id={id}
          value={text}
          disabled={disabled}
          type={
            question.type === "number"
              ? "number"
              : question.type === "email"
                ? "email"
                : question.type === "phone"
                  ? "tel"
                  : "text"
          }
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
