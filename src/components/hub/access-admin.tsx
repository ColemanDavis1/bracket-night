"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Mail, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  ASSIGNABLE_ROLES,
  ROLE_BLURBS,
  ROLE_LABELS,
  inviteError,
  type AdminRole,
} from "@/lib/access/roles";
import {
  inviteAdmin,
  removeAdmin,
  setAdminRole,
} from "@/lib/actions/tournaments";
import type { HubAdmin } from "./types";

/**
 * Hand an event to other people. Invites are by email and activate when the
 * person signs in with that address, so nothing has to be set up in advance —
 * the owner sends them the manage link and it works.
 *
 * Owner only. Everyone else never sees this section.
 */
export function AccessAdmin({
  tournamentId,
  slug,
  admins,
  ownerEmail,
}: {
  tournamentId: string;
  slug: string;
  admins: HubAdmin[];
  ownerEmail: string | null;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("admin");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const manageUrl = origin ? `${origin}/t/${slug}/manage` : "";

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

  function invite() {
    const problem = inviteError(
      email,
      ownerEmail,
      admins.map((a) => a.email),
    );
    if (problem) return setError(problem);
    run(async () => {
      await inviteAdmin(tournamentId, { email, role });
      setEmail("");
    });
  }

  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
        Who can help run this
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Invite someone by email, then send them the manage link. Access starts
        the moment they sign in with that address — they don&apos;t need an
        account first.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Label className="mb-1.5 block text-xs">Email address</Label>
          <Input
            value={email}
            type="email"
            placeholder="volunteer@example.com"
            disabled={pending}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") invite();
            }}
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Role</Label>
          <Select
            value={role}
            disabled={pending}
            onValueChange={(v) => setRole(v as AdminRole)}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button disabled={pending || !email.trim()} onClick={invite}>
          <UserPlus className="h-4 w-4" /> Invite
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{ROLE_BLURBS[role]}</p>

      {error ? (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
        <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <span className="text-sm font-medium">{ownerEmail ?? "You"}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              Created the event
            </span>
          </div>
          <Badge variant="gold">{ROLE_LABELS.owner}</Badge>
        </li>
        {admins.map((a) => (
          <li
            key={a.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
          >
            <div className="min-w-0">
              <span className="text-sm font-medium">{a.email}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {a.acceptedAt ? "Active" : "Invited, not signed in yet"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Select
                value={a.role}
                disabled={pending}
                onValueChange={(v) =>
                  run(() => setAdminRole(tournamentId, a.id, v as AdminRole))
                }
              >
                <SelectTrigger className="h-8 w-52 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                aria-label={`Remove ${a.email}`}
                className="p-1 text-muted-foreground hover:text-destructive"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Remove ${a.email}'s access to this event?`)) {
                    run(() => removeAdmin(tournamentId, a.id));
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyButton label="Copy the manage link" value={manageUrl} />
        <span className="text-xs text-muted-foreground">
          <Mail className="mr-1 inline h-3.5 w-3.5" />
          Send this to anyone you invited — invites don&apos;t email themselves.
        </span>
      </div>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
          What each role can do
        </summary>
        <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          {(["admin", "registrar", "scorekeeper"] as AdminRole[]).map((r) => (
            <li key={r}>
              <span className="font-semibold text-foreground">
                {ROLE_LABELS[r]}
              </span>{" "}
              — {ROLE_BLURBS[r]}
            </li>
          ))}
        </ul>
      </details>
    </section>
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
