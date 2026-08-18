"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Download, Lock, LockOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QrCode } from "@/components/qr-code";
import { SignupFormBuilder } from "./signup-form-builder";
import {
  approveRegistrant,
  declineRegistrant,
  setSignupStyle,
  setTeamMode,
} from "@/lib/actions/tournaments";
import {
  SIGNUP_STYLE_BLURBS,
  SIGNUP_STYLE_LABELS,
  usesCustomForm,
  type SignupStyle,
} from "@/lib/signup/style";
import { formClosed } from "@/lib/signup/form-schema";
import { signupResponsesCsv } from "@/lib/signup/export";
import type { HubRegistrant, HubTeam, HubTournament } from "./types";

/**
 * One place for everything about getting people into the event: how sign-up
 * works, the form itself, the responses, and (outside team mode) the approval
 * queue. Team rosters stay on the Teams tab.
 */
export function SignupAdmin({
  tournament,
  registrants,
  teams,
}: {
  tournament: HubTournament;
  registrants: HubRegistrant[];
  teams: HubTeam[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const teamMode = tournament.entryMode === "team";
  const style = tournament.signupStyle;
  const signupUrl = origin ? `${origin}/t/${tournament.slug}/signup` : "";
  const closed = formClosed(tournament.signupForm);
  const pendingQueue = registrants.filter((r) => r.status === "pending");

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function exportResponses() {
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const csv = signupResponsesCsv(
      tournament.name,
      tournament.signupForm,
      registrants.map((r) => ({
        name: r.name,
        email: r.email,
        phone: r.phone,
        teamName: r.teamId
          ? (teamName.get(r.teamId) ?? r.proposedTeam)
          : r.proposedTeam,
        isCaptain: r.isCaptain,
        signupType: r.signupType,
        status: r.status,
        source: r.source,
        checkedIn: r.checkedIn,
        answers: r.answers,
      })),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tournament.slug}-signups.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-border p-4">
        <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          How people join
        </h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {(Object.keys(SIGNUP_STYLE_LABELS) as SignupStyle[]).map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={() => run(() => setSignupStyle(tournament.id, s))}
              className={`rounded-lg border p-3 text-left transition ${
                style === s
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <span className="text-sm font-semibold">
                {SIGNUP_STYLE_LABELS[s]}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {SIGNUP_STYLE_BLURBS[s]}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Switching style changes the entry mode, the sign-up switch, and which
          paths the form offers. Rosters, results, and the bracket are untouched.
        </p>
      </section>

      {usesCustomForm(style) ? (
        <section className="flex flex-col gap-4 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">Public sign-up</span>
                <Button
                  size="sm"
                  variant={tournament.signupEnabled ? "default" : "outline"}
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      setTeamMode(tournament.id, {
                        signupEnabled: !tournament.signupEnabled,
                      }),
                    )
                  }
                >
                  {tournament.signupEnabled ? (
                    <>
                      <LockOpen className="h-4 w-4" /> Open
                    </>
                  ) : (
                    <>
                      <Lock className="h-4 w-4" /> Closed
                    </>
                  )}
                </Button>
                {closed ? (
                  <Badge variant="gold">Close time passed</Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyButton label="Copy sign-up link" value={signupUrl} />
                <Button size="sm" variant="outline" onClick={exportResponses}>
                  <Download className="h-4 w-4" /> Export responses
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {registrants.length} response
                {registrants.length === 1 ? "" : "s"} so far. The export opens in
                Excel, one row per person.
              </p>
            </div>
          {tournament.signupEnabled && signupUrl ? (
            <QrCode value={signupUrl} size={120} caption="Scan to sign up" />
          ) : null}
        </section>
      ) : (
        <p className="rounded-lg border border-border bg-card/60 px-3 py-2 text-sm text-muted-foreground">
          Manual entry: nobody can reach the form yet. Build it below whenever
          you like, then pick a style above to publish it.
        </p>
      )}

      <SignupFormBuilder
        tournamentId={tournament.id}
        form={tournament.signupForm}
        teamSize={tournament.teamSize}
        teamMode={teamMode}
      />

      {/* Team mode has its own queue on the Teams tab, next to the rosters. */}
      {!teamMode && pendingQueue.length ? (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Approval queue <Badge>{pendingQueue.length}</Badge>
          </h3>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {pendingQueue.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{r.name}</span>
                      <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {r.email ? <span>{r.email}</span> : null}
                        {r.phone ? <span>{r.phone}</span> : null}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => approveRegistrant(r.id))}
                      >
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => run(() => declineRegistrant(r.id))}
                      >
                        <X className="h-4 w-4" /> Decline
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Approving adds the person to the bracket as their own entrant.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* ignore */
        }
      }}
    >
      {copied ? (
        <Check className="h-4 w-4 text-broadcast-green" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}
