"use client";

import { useState, useTransition } from "react";
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

interface Member {
  name: string;
  email: string;
  phone: string;
}

const empty = (): Member => ({ name: "", email: "", phone: "" });

/**
 * Public sign-up form, designed for someone filling it out on a phone in a
 * hallway. Up to two paths: register a full team, or join solo to be placed on
 * a team — whichever the organizer allows. Submissions land in the organizer's
 * approval queue (pending/native).
 */
export function SignupForm({
  tournamentId,
  teamSize,
  signupMode,
}: {
  tournamentId: string;
  teamSize: TeamSizeConfig | null;
  signupMode: SignupMode;
}) {
  const size = teamSize ?? DEFAULT_TEAM_SIZE;
  const paths = allowedSignupTypes(signupMode);
  const [mode, setMode] = useState<"team" | "solo">(paths[0] ?? "team");
  const [teamName, setTeamName] = useState("");
  const [members, setMembers] = useState<Member[]>([empty()]);
  const [solo, setSolo] = useState<Member>(empty());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function updateMember(i: number, patch: Partial<Member>) {
    setMembers((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  function submit() {
    setError(null);
    const payload =
      mode === "team"
        ? {
            tournamentId,
            mode: "team" as const,
            teamName,
            members: members.filter((m) => m.name.trim()),
          }
        : { tournamentId, mode: "solo" as const, members: [solo] };

    startTransition(async () => {
      try {
        await submitSignup(payload);
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
            setMembers([empty()]);
            setSolo(empty());
            setMode(paths[0] ?? "team");
          }}
        >
          Sign up someone else
        </Button>
      </div>
    );
  }

  const rosterFull = members.length >= size.max;
  const canSubmit =
    mode === "team"
      ? teamName.trim() && members.some((m) => m.name.trim())
      : solo.name.trim();

  return (
    <div className="space-y-4">
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
            <Label htmlFor="team-name">Team name</Label>
            <Input
              id="team-name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. The Ballers"
              className="mt-1"
            />
          </div>
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
                {i === 0 ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input
                      value={m.email}
                      onChange={(e) => updateMember(i, { email: e.target.value })}
                      placeholder="Email (optional)"
                      type="email"
                    />
                    <Input
                      value={m.phone}
                      onChange={(e) => updateMember(i, { phone: e.target.value })}
                      placeholder="Phone (optional)"
                      type="tel"
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
                {members.length} of {size.max} players
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {rosterFull
              ? `This event caps teams at ${size.max} players, so that's a full roster.`
              : `Teams can have up to ${size.max} players (${size.min} minimum, target ${size.target}).`}
          </p>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div>
            <Label htmlFor="solo-name">Your name</Label>
            <Input
              id="solo-name"
              value={solo.name}
              onChange={(e) => setSolo({ ...solo, name: e.target.value })}
              placeholder="Full name"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              value={solo.email}
              onChange={(e) => setSolo({ ...solo, email: e.target.value })}
              placeholder="Email (optional)"
              type="email"
            />
            <Input
              value={solo.phone}
              onChange={(e) => setSolo({ ...solo, phone: e.target.value })}
              placeholder="Phone (optional)"
              type="tel"
            />
          </div>
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
