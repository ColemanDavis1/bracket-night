"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  FileSpreadsheet,
  Lock,
  LockOpen,
  Plus,
  Trash2,
  Trophy,
  Undo2,
  Upload,
  UserCheck,
  UserMinus,
  Users,
  Wand2,
  X,
} from "lucide-react";
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
import { QrCode } from "@/components/qr-code";
import {
  DEFAULT_TEAM_SIZE,
  resolveTeamSize,
  fillStatus,
} from "@/lib/teams/sizes";
import {
  buildGoogleFormScript,
  teammateQuestionCount,
  type FormSpec,
} from "@/lib/teams/google-form-script";
import {
  parseRegistrants,
  previewRegistrantImport,
} from "@/lib/import-registrants";
import {
  addRegistrant,
  approveRegistrant,
  assignRegistrantToTeam,
  autoFillTeams,
  checkInWholeTeam,
  createTeam,
  declineRegistrant,
  deleteRegistrants,
  deleteTeam,
  finalizeTeam,
  importRegistrantsCsv,
  markUncheckedAsNoShow,
  moveRegistrants,
  setRegistrantCheckedIn,
  setTeamCheckedIn,
  setTeamMode,
  unfinalizeTeam,
  updateTeam,
} from "@/lib/actions/tournaments";
import { unfinalizeBlockedMessage } from "@/lib/bracket-reset";
import {
  SIGNUP_MODE_BLURBS,
  SIGNUP_MODE_LABELS,
  type SignupMode,
} from "@/lib/teams/signup-mode";
import {
  questionsFor,
  type FormQuestion,
  type SignupFormConfig,
} from "@/lib/signup/form-schema";
import type { HubRegistrant, HubTeam } from "./types";

const SOURCE_LABELS: Record<HubRegistrant["source"], string> = {
  native: "Sign-up",
  google_csv: "Google Form",
  manual: "Manual",
  walkin: "Walk-in",
};

export function TeamsAdmin({
  tournamentId,
  slug,
  eventName,
  gameName,
  eventDate,
  teams,
  registrants,
  teamSize,
  signupEnabled,
  signupMode,
  signupForm,
  googleFormUrl,
  canAdd,
  lockReason,
  playedCount,
}: {
  tournamentId: string;
  slug: string;
  eventName: string;
  gameName: string | null;
  eventDate: string | null;
  teams: HubTeam[];
  registrants: HubRegistrant[];
  teamSize: { target: number; min: number; max: number } | null;
  signupEnabled: boolean;
  signupMode: SignupMode;
  signupForm: SignupFormConfig;
  googleFormUrl: string | null;
  canAdd: boolean;
  lockReason: string;
  /** Recorded scores — a team leaving the draw would orphan them. */
  playedCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [onlyNotArrived, setOnlyNotArrived] = useState(false);
  // Selection spans every list, so people can be gathered from several teams
  // and moved in one go.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const approved = registrants.filter((r) => r.status === "approved");
  const pendingRegs = registrants.filter((r) => r.status === "pending");
  const membersByTeam = useMemo(() => {
    const map = new Map<string, HubRegistrant[]>();
    for (const r of approved) {
      if (!r.teamId) continue;
      const list = map.get(r.teamId) ?? [];
      list.push(r);
      map.set(r.teamId, list);
    }
    return map;
  }, [approved]);
  const soloPool = approved.filter((r) => !r.teamId);

  const checkedInTeams = teams.filter((t) => t.checkedIn).length;
  // Per-person answers are worth seeing while sorting people into teams.
  const personQuestions = questionsFor(signupForm, "person");

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

  function toggleSelect(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function selectAll(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  /** Bulk actions clear the selection so the bar doesn't linger over stale ids. */
  function runOnSelection(fn: (ids: string[]) => Promise<void>) {
    const ids = [...selected];
    run(async () => {
      await fn(ids);
      setSelected(new Set());
    });
  }

  function removePeople(people: HubRegistrant[]) {
    const what =
      people.length === 1
        ? `Remove ${people[0]!.name} from this event?`
        : `Remove ${people.length} people from this event?`;
    if (!confirm(`${what} This deletes the person, not the team.`)) return;
    run(async () => {
      await deleteRegistrants(
        tournamentId,
        people.map((p) => p.id),
      );
      setSelected(new Set());
    });
  }

  return (
    <div className="space-y-8">
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!canAdd ? (
        <p className="flex items-center gap-2 rounded-md border border-broadcast-gold/40 bg-broadcast-gold/10 px-3 py-2 text-sm">
          <Lock className="h-4 w-4 text-broadcast-gold" /> {lockReason}
        </p>
      ) : null}

      <ShareRow
        slug={slug}
        tournamentId={tournamentId}
        signupEnabled={signupEnabled}
        signupMode={signupMode}
        googleFormUrl={googleFormUrl}
        onToggleSignups={(v) =>
          run(() => setTeamMode(tournamentId, { signupEnabled: v }))
        }
        onChangeMode={(m) =>
          run(() => setTeamMode(tournamentId, { signupMode: m }))
        }
        disabled={pending}
      />

      {/* Check-in summary */}
      <section className="rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UserCheck className="h-4 w-4 text-primary" />
            {checkedInTeams} / {teams.length} teams checked in
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={onlyNotArrived}
                onChange={(e) => setOnlyNotArrived(e.target.checked)}
              />
              Show not-yet-arrived only
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                if (
                  confirm(
                    "Forfeit every ready match whose team hasn't checked in? The present opponent advances.",
                  )
                ) {
                  run(() => markUncheckedAsNoShow(tournamentId));
                }
              }}
            >
              <AlertTriangle className="h-4 w-4" /> Forfeit un-checked-in
            </Button>
          </div>
        </div>
      </section>

      {/* Approval queue */}
      {pendingRegs.length > 0 ? (
        <ApprovalQueue
          pending={pendingRegs}
          disabled={pending}
          onApprove={(id) => run(() => approveRegistrant(id))}
          onDecline={(id) => run(() => declineRegistrant(id))}
          onDelete={(r) => removePeople([r])}
        />
      ) : null}

      {/* Roster board */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            Roster board
          </h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending || soloPool.length === 0 || teams.length === 0}
              onClick={() => run(() => autoFillTeams(tournamentId))}
            >
              <Wand2 className="h-4 w-4" /> Auto-fill teams
            </Button>
            <AddTeam
              disabled={pending || !canAdd}
              onAdd={(name) => run(() => createTeam(tournamentId, { name }))}
            />
          </div>
        </div>

        {selected.size > 0 ? (
          <div className="sticky bottom-3 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/50 bg-card p-3 shadow-lg">
            <span className="text-sm font-semibold">
              {selected.size} selected
            </span>
            <Select
              disabled={pending}
              onValueChange={(v) =>
                runOnSelection((ids) =>
                  moveRegistrants(
                    tournamentId,
                    ids,
                    v === "__solo__" ? null : v,
                  ),
                )
              }
            >
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue placeholder="Move to…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__solo__">Solo pool</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                removePeople(approved.filter((r) => selected.has(r.id)))
              }
            >
              <Trash2 className="h-4 w-4" /> Remove from event
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {/* Unassigned solo pool */}
          <div className="rounded-lg border border-dashed border-border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-muted-foreground" /> Solo pool (
              {soloPool.length})
            </div>
            <MemberList
              members={onlyNotArrived ? soloPool.filter((m) => !m.checkedIn) : soloPool}
              teams={teams}
              currentTeamId={null}
              disabled={pending}
              questions={personQuestions}
              selected={selected}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAll}
              onAssign={(rid, teamId) =>
                run(() => assignRegistrantToTeam(rid, teamId))
              }
              onToggleArrived={(rid, v) =>
                run(() => setRegistrantCheckedIn(rid, v))
              }
              onDelete={(r) => removePeople([r])}
            />
          </div>

          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              slug={slug}
              members={membersByTeam.get(team.id) ?? []}
              teams={teams}
              teamSize={teamSize}
              canAdd={canAdd}
              questions={personQuestions}
              playedCount={playedCount}
              onlyNotArrived={onlyNotArrived}
              disabled={pending}
              selected={selected}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAll}
              onDeletePeople={removePeople}
              run={run}
            />
          ))}
        </div>
      </section>

      {/* Walk-in + CSV import */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AddWalkin
          teams={teams}
          disabled={pending}
          onAdd={(input) => run(() => addRegistrant(tournamentId, input))}
        />
        <CsvImport
          existingNames={registrants.map((r) => r.name)}
          disabled={pending}
          onImport={(rows) => run(() => importRegistrantsCsv(tournamentId, rows))}
        />
      </div>

      <GoogleFormBuilder
        spec={{
          eventName,
          gameName,
          eventDate,
          signupMode,
          teamMax: teamSize?.max ?? DEFAULT_TEAM_SIZE.max,
        }}
        savedUrl={googleFormUrl}
        disabled={pending}
        onSaveUrl={(url) => run(() => setTeamMode(tournamentId, { googleFormUrl: url }))}
      />
    </div>
  );
}

// --------------------------------------------------------------------------

function ShareRow({
  slug,
  signupEnabled,
  signupMode,
  googleFormUrl,
  onToggleSignups,
  onChangeMode,
  disabled,
}: {
  slug: string;
  tournamentId: string;
  signupEnabled: boolean;
  signupMode: SignupMode;
  googleFormUrl: string | null;
  onToggleSignups: (v: boolean) => void;
  onChangeMode: (mode: SignupMode) => void;
  disabled: boolean;
}) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const signupUrl = origin ? `${origin}/t/${slug}/signup` : "";

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Public sign-up</span>
          <Button
            size="sm"
            variant={signupEnabled ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onToggleSignups(!signupEnabled)}
          >
            {signupEnabled ? (
              <>
                <LockOpen className="h-4 w-4" /> Open
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" /> Closed
              </>
            )}
          </Button>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs">Who can sign up</Label>
          <Select
            value={signupMode}
            disabled={disabled}
            onValueChange={(v) => onChangeMode(v as SignupMode)}
          >
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SIGNUP_MODE_LABELS) as SignupMode[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {SIGNUP_MODE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 max-w-xs text-xs text-muted-foreground">
            {SIGNUP_MODE_BLURBS[signupMode]} Applies to the sign-up link and QR
            code; your Google Form and walk-in adds are unaffected.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton label="Copy sign-up link" value={signupUrl} />
          {googleFormUrl ? (
            <CopyButton label="Copy Google Form" value={googleFormUrl} />
          ) : null}
        </div>
      </div>
      {signupEnabled ? (
        <QrCode value={signupUrl} size={120} caption="Scan to sign up" />
      ) : null}
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
      {copied ? <Check className="h-4 w-4 text-broadcast-green" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function ApprovalQueue({
  pending,
  disabled,
  onApprove,
  onDecline,
  onDelete,
}: {
  pending: HubRegistrant[];
  disabled: boolean;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  onDelete: (registrant: HubRegistrant) => void;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
        Approval queue <Badge>{pending.length}</Badge>
      </h3>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {pending.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
          >
            <div className="min-w-0">
              <span className="text-sm font-medium">{r.name}</span>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="muted">
                  {r.signupType === "team"
                    ? `Team${r.proposedTeam ? `: ${r.proposedTeam}` : ""}`
                    : "Solo"}
                </Badge>
                <Badge variant="muted">{SOURCE_LABELS[r.source]}</Badge>
                {r.isCaptain ? <Badge variant="muted">Captain</Badge> : null}
                {r.email ? <span>{r.email}</span> : null}
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                disabled={disabled}
                onClick={() => onApprove(r.id)}
              >
                <Check className="h-4 w-4" /> Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => onDecline(r.id)}
              >
                <X className="h-4 w-4" /> Decline
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${r.name}`}
                title="Delete the sign-up entirely"
                disabled={disabled}
                onClick={() => onDelete(r)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeamCard({
  team,
  slug,
  members,
  teams,
  teamSize,
  canAdd,
  questions,
  playedCount,
  onlyNotArrived,
  disabled,
  selected,
  onToggleSelect,
  onSelectAll,
  onDeletePeople,
  run,
}: {
  team: HubTeam;
  slug: string;
  members: HubRegistrant[];
  teams: HubTeam[];
  teamSize: { target: number; min: number; max: number } | null;
  canAdd: boolean;
  questions: FormQuestion[];
  playedCount: number;
  onlyNotArrived: boolean;
  disabled: boolean;
  selected: ReadonlySet<string>;
  onToggleSelect: (registrantId: string, on: boolean) => void;
  onSelectAll: (registrantIds: string[], on: boolean) => void;
  onDeletePeople: (people: HubRegistrant[]) => void;
  run: (fn: () => Promise<void>) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(team.name);
  const [origin, setOrigin] = useState("");
  const [showQr, setShowQr] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  const size = resolveTeamSize(
    { target_size: team.targetSize, min_size: team.minSize, max_size: team.maxSize },
    teamSize,
  );
  const status = fillStatus(members.length, size);
  const finalized = team.playerId != null;
  const teamUrl = origin ? `${origin}/t/${slug}?team=${team.id}` : "";
  const shown = onlyNotArrived ? members.filter((m) => !m.checkedIn) : members;

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex gap-1.5">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8"
              />
              <Button
                size="sm"
                disabled={disabled}
                onClick={() => {
                  run(() => updateTeam(team.id, { name }));
                  setRenaming(false);
                }}
              >
                Save
              </Button>
            </div>
          ) : (
            <button
              className="text-left text-sm font-semibold hover:underline"
              onClick={() => {
                setName(team.name);
                setRenaming(true);
              }}
            >
              {team.name}
            </button>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <Badge
              variant={
                status === "under" ? "muted" : status === "over" ? "gold" : "default"
              }
            >
              {members.length} / {size.target}
            </Badge>
            {status === "under" ? (
              <span className="text-muted-foreground">under min ({size.min})</span>
            ) : null}
            {status === "over" ? (
              <span className="text-broadcast-gold">over max ({size.max})</span>
            ) : null}
            {finalized ? (
              <Badge variant="gold">
                <Trophy className="mr-1 h-3 w-3" /> In bracket
              </Badge>
            ) : null}
            {team.checkedIn ? <Badge variant="default">Arrived</Badge> : null}
          </div>
        </div>
      </div>

      <MemberList
        members={shown}
        teams={teams}
        currentTeamId={team.id}
        disabled={disabled}
        questions={questions}
        selected={selected}
        onToggleSelect={onToggleSelect}
        onSelectAll={onSelectAll}
        onAssign={(rid, teamId) => run(() => assignRegistrantToTeam(rid, teamId))}
        onToggleArrived={(rid, v) => run(() => setRegistrantCheckedIn(rid, v))}
        onDelete={(r) => onDeletePeople([r])}
      />

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => run(() => checkInWholeTeam(team.id))}
        >
          <UserCheck className="h-4 w-4" /> Check in team
        </Button>
        <Button
          size="sm"
          variant={team.checkedIn ? "ghost" : "outline"}
          disabled={disabled}
          onClick={() => run(() => setTeamCheckedIn(team.id, !team.checkedIn))}
        >
          {team.checkedIn ? "Undo arrived" : "Arrived"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => run(() => updateTeam(team.id, { locked: !team.locked }))}
        >
          {team.locked ? (
            <>
              <LockOpen className="h-4 w-4" /> Unlock
            </>
          ) : (
            <>
              <Lock className="h-4 w-4" /> Lock
            </>
          )}
        </Button>
        {!finalized ? (
          <Button
            size="sm"
            disabled={disabled || !canAdd}
            onClick={() => run(() => finalizeTeam(team.id))}
          >
            <CheckCircle2 className="h-4 w-4" /> Finalize
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              // Scores already recorded would re-attach to a different pairing
              // after the re-draw, so clearing them is the price of the undo.
              if (
                playedCount > 0 &&
                !confirm(unfinalizeBlockedMessage(team.name, playedCount))
              ) {
                return;
              }
              run(() => unfinalizeTeam(team.id, { clearResults: true }));
            }}
          >
            <Undo2 className="h-4 w-4" /> Undo finalize
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowQr((v) => !v)}
        >
          QR
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            if (confirm(`Delete team "${team.name}"? Members return to the solo pool.`)) {
              run(() => deleteTeam(team.id));
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {showQr ? (
        <div className="mt-3 flex justify-center">
          <QrCode value={teamUrl} size={120} caption="Team schedule" />
        </div>
      ) : null}
    </div>
  );
}

function MemberList({
  members,
  teams,
  currentTeamId,
  disabled,
  questions,
  selected,
  onToggleSelect,
  onSelectAll,
  onAssign,
  onToggleArrived,
  onDelete,
}: {
  members: HubRegistrant[];
  teams: HubTeam[];
  currentTeamId: string | null;
  disabled: boolean;
  questions: FormQuestion[];
  selected: ReadonlySet<string>;
  onToggleSelect: (registrantId: string, on: boolean) => void;
  onSelectAll: (registrantIds: string[], on: boolean) => void;
  onAssign: (registrantId: string, teamId: string | null) => void;
  onToggleArrived: (registrantId: string, checkedIn: boolean) => void;
  onDelete: (registrant: HubRegistrant) => void;
}) {
  if (members.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">No members.</p>;
  }
  const ids = members.map((m) => m.id);
  const allSelected = ids.every((id) => selected.has(id));

  return (
    <ul className="mt-2 space-y-1.5">
      {members.length > 1 ? (
        <li className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            aria-label={allSelected ? "Deselect all" : "Select all"}
            checked={allSelected}
            disabled={disabled}
            onChange={(e) => onSelectAll(ids, e.target.checked)}
          />
          {allSelected ? "Deselect all" : "Select all"}
        </li>
      ) : null}
      {members.map((m) => (
        <li key={m.id} className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            aria-label={`Select ${m.name}`}
            checked={selected.has(m.id)}
            disabled={disabled}
            onChange={(e) => onToggleSelect(m.id, e.target.checked)}
          />
          <button
            type="button"
            aria-label={m.checkedIn ? "Checked in" : "Not arrived"}
            className={m.checkedIn ? "text-broadcast-green" : "text-muted-foreground"}
            disabled={disabled}
            onClick={() => onToggleArrived(m.id, !m.checkedIn)}
          >
            <CheckCircle2 className="h-4 w-4" />
          </button>
          <span className="flex-1 truncate">
            {m.name}
            {m.isCaptain ? (
              <span className="ml-1 text-xs text-muted-foreground">(C)</span>
            ) : null}
            <AnswerSummary questions={questions} answers={m.answers} />
          </span>
          {currentTeamId ? (
            <button
              type="button"
              aria-label={`Move ${m.name} to the solo pool`}
              title="Move to solo pool"
              className="text-muted-foreground hover:text-foreground"
              disabled={disabled}
              onClick={() => onAssign(m.id, null)}
            >
              <UserMinus className="h-4 w-4" />
            </button>
          ) : null}
          <Select
            value={currentTeamId ?? "__solo__"}
            disabled={disabled}
            onValueChange={(v) =>
              onAssign(m.id, v === "__solo__" ? null : v)
            }
          >
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__solo__">Solo pool</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            aria-label={`Remove ${m.name} from the event`}
            title="Remove from event"
            className="text-muted-foreground hover:text-destructive"
            disabled={disabled}
            onClick={() => onDelete(m)}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Their form answers, one muted line under the name. */
function AnswerSummary({
  questions,
  answers,
}: {
  questions: FormQuestion[];
  answers: HubRegistrant["answers"];
}) {
  const filled = questions
    .map((q) => {
      const v = answers[q.id];
      if (v === undefined || (Array.isArray(v) && !v.length)) return null;
      return `${q.label}: ${Array.isArray(v) ? v.join(", ") : v}`;
    })
    .filter((line): line is string => line !== null);
  if (!filled.length) return null;
  return (
    <span className="block truncate text-xs text-muted-foreground">
      {filled.join(" · ")}
    </span>
  );
}

function AddTeam({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="flex gap-1.5">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) {
            onAdd(name.trim());
            setName("");
          }
        }}
        placeholder="New team name"
        className="h-9 w-40"
        disabled={disabled}
      />
      <Button
        size="sm"
        disabled={disabled || !name.trim()}
        onClick={() => {
          onAdd(name.trim());
          setName("");
        }}
      >
        <Plus className="h-4 w-4" /> Team
      </Button>
    </div>
  );
}

function AddWalkin({
  teams,
  disabled,
  onAdd,
}: {
  teams: HubTeam[];
  disabled: boolean;
  onAdd: (input: {
    name: string;
    signupType: "solo" | "team";
    teamId?: string | null;
    source: "walkin";
  }) => void;
}) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("__solo__");

  function submit() {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      signupType: target === "__solo__" ? "solo" : "team",
      teamId: target === "__solo__" ? null : target,
      source: "walkin",
    });
    setName("");
  }

  return (
    <section className="rounded-lg border border-border p-4">
      <Label className="mb-2 block">Add a walk-in</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Name"
          className="flex-1"
          disabled={disabled}
        />
        <Select value={target} onValueChange={setTarget} disabled={disabled}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__solo__">Solo pool</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={disabled || !name.trim()} onClick={submit}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
    </section>
  );
}

/**
 * Build a Google Form for this event without asking the organizer to wire up
 * OAuth: we emit an Apps Script they run in their own account, so the form is
 * created in their Drive and owned by them. Questions are worded to match the
 * CSV importer, so the round trip needs no manual column mapping.
 */
function GoogleFormBuilder({
  spec,
  savedUrl,
  disabled,
  onSaveUrl,
}: {
  spec: Omit<FormSpec, "collectPhone">;
  savedUrl: string | null;
  disabled: boolean;
  onSaveUrl: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [collectPhone, setCollectPhone] = useState(false);
  const [url, setUrl] = useState(savedUrl ?? "");

  const script = useMemo(
    () => buildGoogleFormScript({ ...spec, collectPhone }),
    [spec, collectPhone],
  );
  const teammates = teammateQuestionCount(spec.teamMax);

  return (
    <section className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label>Google Form</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Generate a form matched to this event — {SIGNUP_MODE_LABELS[
              spec.signupMode
            ].toLowerCase()}
            {teammates > 0
              ? `, ${teammates} teammate question${teammates === 1 ? "" : "s"}`
              : ""}
            . Created in your own Google Drive.
          </p>
        </div>
        <Button
          size="sm"
          variant={open ? "ghost" : "outline"}
          onClick={() => setOpen((v) => !v)}
        >
          <FileSpreadsheet className="h-4 w-4" />
          {open ? "Hide" : "Generate a Google Form"}
        </Button>
      </div>

      {open ? (
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={collectPhone}
              onChange={(e) => setCollectPhone(e.target.checked)}
            />
            Also ask for a phone number
          </label>

          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              Copy the script below and open{" "}
              <a
                href="https://script.google.com/home/projects/create"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary hover:underline"
              >
                script.google.com
              </a>
              .
            </li>
            <li>Replace everything in the editor with it, then press Run.</li>
            <li>
              Approve the permission prompt — it only creates a new form.
            </li>
            <li>Open View &gt; Logs, copy the form link, and paste it below.</li>
          </ol>

          <textarea
            readOnly
            value={script}
            rows={12}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <CopyButton label="Copy the script" value={script} />

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1">
              <Label className="mb-1.5 block text-xs">
                Form link (saved with the event)
              </Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/forms/…"
              />
            </div>
            <Button
              size="sm"
              disabled={disabled || url.trim() === (savedUrl ?? "")}
              onClick={() => onSaveUrl(url.trim())}
            >
              Save link
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CsvImport({
  existingNames,
  disabled,
  onImport,
}: {
  existingNames: string[];
  disabled: boolean;
  onImport: (rows: ReturnType<typeof parseRegistrants>) => void;
}) {
  const [text, setText] = useState("");
  const preview = useMemo(() => {
    if (!text.trim()) return null;
    try {
      const parsed = parseRegistrants(text);
      return { parsed, ...previewRegistrantImport(parsed, existingNames) };
    } catch {
      return null;
    }
  }, [text, existingNames]);

  return (
    <section className="rounded-lg border border-border p-4">
      <Label className="mb-2 block">Import Google Form CSV</Label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Paste your Google Form CSV export here (headers included)…"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {preview ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="muted">{preview.toAdd.length} to add</Badge>
          <Badge variant="muted">{preview.teams.length} teams</Badge>
          <Badge variant="muted">{preview.solos.length} solos</Badge>
          {preview.duplicates ? (
            <Badge variant="muted">{preview.duplicates} duplicates</Badge>
          ) : null}
          {preview.overflow ? (
            <Badge variant="muted">{preview.overflow} over cap</Badge>
          ) : null}
        </div>
      ) : null}
      <Button
        className="mt-3"
        size="sm"
        disabled={disabled || !preview || preview.toAdd.length === 0}
        onClick={() => {
          if (preview) {
            onImport(preview.toAdd);
            setText("");
          }
        }}
      >
        <Upload className="h-4 w-4" /> Import to approval queue
      </Button>
    </section>
  );
}
