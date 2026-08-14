"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Lock,
  LockOpen,
  RotateCcw,
  Save,
  Shuffle,
  Undo2,
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
import {
  FORMAT_BLURBS,
  FORMAT_LABELS,
  SCORING_LABELS,
  SEEDING_LABELS,
  TIEBREAK_LABELS,
  TONE_LABELS,
} from "@/lib/labels";
import type {
  AiTone,
  MainFormat,
  PointsTiebreak,
  ScoringMode,
  SeedingMethod,
} from "@/lib/engine";
import {
  rebuildBlockedMessage,
  structuralChanges,
  type SettingsPatch,
  type SettingsSnapshot,
} from "@/lib/tournament-settings";
import { resetBracketMessage } from "@/lib/bracket-reset";
import { DEFAULT_TEAM_SIZE, normalizeTeamSize } from "@/lib/teams/sizes";
import {
  resetBracket,
  setTeamMode,
  updateTournamentSettings,
} from "@/lib/actions/tournaments";
import type { HubTournament } from "./types";

/**
 * Organizer settings for a tournament that is already underway. Sign-ups
 * typically run before the head count is known, so the format can be decided
 * (and re-decided) here rather than only in the creation wizard.
 */
export function SettingsAdmin({
  tournament,
  playedCount,
  entrantCount,
  teamsLocked,
  lockReason,
  finalizedTeams,
}: {
  tournament: HubTournament;
  playedCount: number;
  entrantCount: number;
  /** True once the knockout round has started and the field is fixed. */
  teamsLocked: boolean;
  lockReason: string;
  /** Teams currently holding a bracket slot (0 in individual mode). */
  finalizedTeams: number;
}) {
  const current: SettingsSnapshot = useMemo(
    () => ({
      name: tournament.name,
      gameName: tournament.gameName,
      eventDate: tournament.eventDate,
      format: tournament.format,
      scoringMode: tournament.scoringMode,
      seedingMethod: tournament.seedingMethod,
      tiebreak: tournament.tiebreak,
      aiTone: tournament.aiTone,
      seedingRounds: tournament.seedingRounds ?? undefined,
      roundRobinDouble: tournament.roundRobinDouble,
      numGroups: tournament.numGroups ?? undefined,
      advancePerGroup: tournament.advancePerGroup ?? undefined,
      groupDoubleRoundRobin: tournament.groupDoubleRoundRobin,
      knockoutFormat: tournament.knockoutFormat ?? undefined,
      numStations: tournament.numStations,
      seriesLength: tournament.seriesLength,
      selfServiceScoring: tournament.selfServiceScoring,
      notes: tournament.notes ?? undefined,
    }),
    [tournament],
  );

  const [draft, setDraft] = useState<SettingsSnapshot>(current);
  const [reshuffle, setReshuffle] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [size, setSize] = useState(tournament.teamSize ?? DEFAULT_TEAM_SIZE);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const teamMode = tournament.entryMode === "team";
  const set = <K extends keyof SettingsSnapshot>(
    key: K,
    value: SettingsSnapshot[K],
  ) => {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  // Send concrete values for whatever the chosen format needs, so switching
  // format never leaves the engine to guess at a group shape it wasn't given.
  const patch: SettingsPatch = useMemo(() => {
    const p: SettingsPatch = { ...draft, reshuffleDraw: reshuffle };
    if (p.format === "group_knockout") {
      p.numGroups = draft.numGroups ?? 2;
      p.advancePerGroup = draft.advancePerGroup ?? 2;
      p.knockoutFormat = draft.knockoutFormat ?? "single_elim";
    }
    if (p.seedingMethod === "seeding_rounds") {
      p.seedingRounds = draft.seedingRounds ?? 2;
    }
    return p;
  }, [draft, reshuffle]);
  const structural = structuralChanges(current, patch);
  const sizeChanged =
    !tournament.teamSize ||
    size.target !== tournament.teamSize.target ||
    size.min !== tournament.teamSize.min ||
    size.max !== tournament.teamSize.max;
  const settingsChanged =
    reshuffle ||
    (Object.keys(current) as (keyof SettingsSnapshot)[]).some(
      (k) => draft[k] !== current[k],
    );
  const dirty = settingsChanged || (teamMode && sizeChanged);

  // A rebuild renumbers matches, so anything already scored would be orphaned.
  const needsConfirm =
    settingsChanged && structural.length > 0 && playedCount > 0;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        if (settingsChanged) {
          await updateTournamentSettings(tournament.id, {
            ...patch,
            clearResults: needsConfirm ? confirmClear : undefined,
          });
        }
        if (teamMode && sizeChanged) {
          await setTeamMode(tournament.id, { teamSize: normalizeTeamSize(size) });
        }
        setReshuffle(false);
        setConfirmClear(false);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save settings.");
      }
    });
  }

  function reset() {
    setDraft(current);
    setSize(tournament.teamSize ?? DEFAULT_TEAM_SIZE);
    setReshuffle(false);
    setConfirmClear(false);
    setError(null);
    setSaved(false);
  }

  const resetMessage = resetBracketMessage({
    finalizedTeams,
    results: playedCount,
  });

  const formats = (Object.keys(FORMAT_LABELS) as MainFormat[]).filter(
    // The multi-stage pipeline is built in the wizard; don't offer it as a
    // switch target here, but keep it selectable if it's already in use.
    (f) => f !== "multi_stage" || tournament.format === "multi_stage",
  );

  return (
    <div className="space-y-6">
      {teamsLocked ? (
        <p className="flex items-start gap-2 rounded-lg border border-broadcast-gold/40 bg-broadcast-gold/10 px-3 py-2 text-sm">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-broadcast-gold" />
          <span>
            {lockReason}. Format changes still work, but they rebuild the
            schedule and clear scores. Use <strong>Reset the draw</strong> below
            to go back to setup.
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-sm">
          <LockOpen className="mt-0.5 h-4 w-4 shrink-0 text-broadcast-green" />
          <span>
            Setup is still open — everything here is safe to change
            {playedCount === 0 ? " and nothing has been played yet" : ""}. The
            field locks once the knockout round starts.
          </span>
        </p>
      )}

      <Section
        title="Event details"
        desc="Shown on the public hub and the TV board."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tournament name">
            <Input
              value={draft.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="Game">
            <Input
              value={draft.gameName ?? ""}
              onChange={(e) => set("gameName", e.target.value)}
              placeholder="e.g. Cornhole"
            />
          </Field>
          <Field label="Event date">
            <Input
              type="date"
              value={draft.eventDate ?? ""}
              onChange={(e) => set("eventDate", e.target.value)}
            />
          </Field>
          <Field label="Commentary tone">
            <Select
              value={draft.aiTone}
              onValueChange={(v) => set("aiTone", v as AiTone)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TONE_LABELS) as AiTone[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {TONE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="House rules / notes" className="mt-4">
          <textarea
            value={draft.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            placeholder="Anything players should know…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </Field>
      </Section>

      <Section
        title="Format"
        desc={`Set the format now that ${entrantCount} ${
          teamMode ? "team" : "player"
        }${entrantCount === 1 ? "" : "s"} ${
          entrantCount === 1 ? "is" : "are"
        } in. Changing this rebuilds the schedule.`}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Main format">
            <Select
              value={draft.format}
              onValueChange={(v) => set("format", v as MainFormat)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formats.map((f) => (
                  <SelectItem key={f} value={f}>
                    {FORMAT_LABELS[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Seeding">
            <Select
              value={draft.seedingMethod}
              onValueChange={(v) => set("seedingMethod", v as SeedingMethod)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SEEDING_LABELS) as SeedingMethod[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SEEDING_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        {draft.format ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {FORMAT_BLURBS[draft.format]}
          </p>
        ) : null}

        {draft.seedingMethod === "seeding_rounds" ? (
          <Field label="Seeding rounds" className="mt-4 max-w-xs">
            <Select
              value={String(draft.seedingRounds ?? 2)}
              onValueChange={(v) =>
                set("seedingRounds", v === "full" ? "full" : Number(v))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 round</SelectItem>
                <SelectItem value="2">2 rounds</SelectItem>
                <SelectItem value="3">3 rounds</SelectItem>
                <SelectItem value="full">Full round robin</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        {draft.format === "round_robin" ? (
          <CheckRow
            className="mt-4"
            checked={draft.roundRobinDouble ?? false}
            onChange={(v) => set("roundRobinDouble", v)}
            label="Double round robin (everyone plays everyone twice)"
          />
        ) : null}

        {draft.format === "group_knockout" ? (
          <div className="mt-4 space-y-4 rounded-lg border border-border p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Number of groups">
                <Input
                  type="number"
                  min={1}
                  max={32}
                  value={draft.numGroups ?? 2}
                  onChange={(e) => set("numGroups", Number(e.target.value) || 1)}
                />
              </Field>
              <Field label="Advance per group">
                <Input
                  type="number"
                  min={1}
                  max={16}
                  value={draft.advancePerGroup ?? 2}
                  onChange={(e) =>
                    set("advancePerGroup", Number(e.target.value) || 1)
                  }
                />
              </Field>
              <Field label="Knockout format">
                <Select
                  value={draft.knockoutFormat ?? "single_elim"}
                  onValueChange={(v) =>
                    set(
                      "knockoutFormat",
                      v as "single_elim" | "double_elim" | "triple_elim",
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_elim">Single elimination</SelectItem>
                    <SelectItem value="double_elim">Double elimination</SelectItem>
                    <SelectItem value="triple_elim">Triple elimination</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <CheckRow
              checked={draft.groupDoubleRoundRobin ?? false}
              onChange={(v) => set("groupDoubleRoundRobin", v)}
              label="Double round robin within each group"
            />
          </div>
        ) : null}

        <div className="mt-4">
          <Button
            type="button"
            variant={reshuffle ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setSaved(false);
              setReshuffle((v) => !v);
            }}
          >
            <Shuffle className="h-4 w-4" />
            {reshuffle ? "Re-draw on save" : "Re-draw the bracket"}
          </Button>
        </div>
      </Section>

      <Section title="Scoring & play" desc="Safe to change mid-event.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Scoring">
            <Select
              value={draft.scoringMode}
              onValueChange={(v) => set("scoringMode", v as ScoringMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SCORING_LABELS) as ScoringMode[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SCORING_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tiebreaker">
            <Select
              value={draft.tiebreak}
              onValueChange={(v) => set("tiebreak", v as PointsTiebreak)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TIEBREAK_LABELS) as PointsTiebreak[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {TIEBREAK_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Parallel stations">
            <Select
              value={String(draft.numStations ?? 1)}
              onValueChange={(v) => set("numStations", Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n === 1 ? "1 (sequential)" : `${n} stations`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Match length">
            <Select
              value={String(draft.seriesLength ?? 1)}
              onValueChange={(v) => set("seriesLength", Number(v) as 1 | 3 | 5)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Best of 1 (single game)</SelectItem>
                <SelectItem value="3">Best of 3</SelectItem>
                <SelectItem value="5">Best of 5</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <CheckRow
          className="mt-4"
          checked={draft.selfServiceScoring ?? false}
          onChange={(v) => set("selfServiceScoring", v)}
          label="Let players submit scores for my approval"
        />
      </Section>

      {teamMode ? (
        <Section
          title="Team size"
          desc="The max is enforced on the public sign-up form and on walk-in adds."
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Minimum">
              <Input
                type="number"
                min={1}
                value={size.min}
                onChange={(e) => {
                  setSaved(false);
                  setSize({ ...size, min: Number(e.target.value) || 1 });
                }}
              />
            </Field>
            <Field label="Target">
              <Input
                type="number"
                min={1}
                value={size.target}
                onChange={(e) => {
                  setSaved(false);
                  setSize({ ...size, target: Number(e.target.value) || 1 });
                }}
              />
            </Field>
            <Field label="Maximum">
              <Input
                type="number"
                min={1}
                value={size.max}
                onChange={(e) => {
                  setSaved(false);
                  setSize({ ...size, max: Number(e.target.value) || 1 });
                }}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A max of {normalizeTeamSize(size).max} means a captain can add{" "}
            {Math.max(0, normalizeTeamSize(size).max - 1)} teammate
            {normalizeTeamSize(size).max - 1 === 1 ? "" : "s"} when signing up.
            Individual teams can still be overridden on the Teams tab.
          </p>
        </Section>
      ) : null}

      {needsConfirm ? (
        <div className="rounded-lg border border-broadcast-gold/40 bg-broadcast-gold/10 p-4">
          <p className="flex items-start gap-2 text-sm font-semibold">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-broadcast-gold" />
            {rebuildBlockedMessage(structural, playedCount)}
          </p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmClear}
              onChange={(e) => setConfirmClear(e.target.checked)}
            />
            Yes, rebuild the schedule and clear those scores
          </label>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          disabled={pending || !dirty || (needsConfirm && !confirmClear)}
          onClick={save}
        >
          <Save className="h-4 w-4" />
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button variant="outline" disabled={pending || !dirty} onClick={reset}>
          <RotateCcw className="h-4 w-4" /> Discard
        </Button>
        {saved && !dirty ? (
          <span className="text-sm text-broadcast-green">Settings saved.</span>
        ) : null}
      </div>

      <Section
        title="Reset the draw"
        desc="Undo bracket generation and team lock-in. Sign-ups, rosters, and check-ins are kept."
      >
        <p className="text-sm text-muted-foreground">
          {resetMessage}
        </p>
        <Button
          className="mt-3"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (confirm(`${resetMessage}\n\nReset the draw?`)) {
              startTransition(async () => {
                setError(null);
                try {
                  await resetBracket(tournament.id, { clearResults: true });
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not reset the draw.",
                  );
                }
              });
            }
          }}
        >
          <Undo2 className="h-4 w-4" /> Reset the draw
        </Button>
      </Section>
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border p-4">
      <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      {desc ? (
        <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <label className={`flex items-center gap-2 text-sm ${className ?? ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
