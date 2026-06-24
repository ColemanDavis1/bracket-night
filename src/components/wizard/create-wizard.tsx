"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  FORMAT_BLURBS,
  FORMAT_LABELS,
  SCORING_LABELS,
  SEEDING_LABELS,
  TIEBREAK_LABELS,
  TONE_LABELS,
} from "@/lib/labels";
import { groupKey, groupKeyList, nextPow2 } from "@/lib/engine";
import { MAX_PLAYERS } from "@/lib/constants";
import type {
  AiTone,
  MainFormat,
  PointsTiebreak,
  ScoringMode,
  SeedingMethod,
  StageConfig,
  StageKindName,
} from "@/lib/engine";
import { createTournament } from "@/lib/actions/tournaments";
import { TEMPLATES, type Template } from "@/lib/templates";
import { SortableList } from "./sortable-list";
import { BulkImport } from "./bulk-import";

interface Player {
  id: string;
  name: string;
}

const STEPS = [
  "Basics",
  "Players",
  "Scoring",
  "Seeding",
  "Format",
  "Tiebreak",
  "AI tone",
  "Review",
];

let pid = 0;
const newPlayer = (name = ""): Player => ({ id: `p${pid++}`, name });

export function CreateWizard() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Step 1
  const [name, setName] = useState("");
  const [gameName, setGameName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [notes, setNotes] = useState("");
  // Step 2
  const [players, setPlayers] = useState<Player[]>([
    newPlayer(),
    newPlayer(),
    newPlayer(),
    newPlayer(),
  ]);
  // Step 3
  const [scoringMode, setScoringMode] = useState<ScoringMode>("scored");
  // Step 4
  const [seedingMethod, setSeedingMethod] =
    useState<SeedingMethod>("random");
  const [seedingRounds, setSeedingRounds] = useState<string>("2");
  const [manualOrder, setManualOrder] = useState<string[]>([]);
  // Step 5
  const [format, setFormat] = useState<MainFormat>("single_elim");
  const [roundRobinDouble, setRoundRobinDouble] = useState(false);
  const [numGroups, setNumGroups] = useState(2);
  const [advancePerGroup, setAdvancePerGroup] = useState(2);
  const [groupDouble, setGroupDouble] = useState(false);
  const [groupDraw, setGroupDraw] = useState<"random" | "manual">("random");
  const [knockoutFormat, setKnockoutFormat] = useState<
    "single_elim" | "double_elim" | "triple_elim"
  >("single_elim");
  const [groupAssign, setGroupAssign] = useState<Record<string, string>>({});
  // Step 5 — multi-stage pipeline
  const [stages, setStages] = useState<StageConfig[]>([
    { type: "group", numGroups: 4, advancePerGroup: 2, draw: "random" },
    { type: "single_elim" },
  ]);
  // Match settings (apply across formats)
  const [numStations, setNumStations] = useState(1);
  const [seriesLength, setSeriesLength] = useState<1 | 3 | 5>(1);
  const [selfServiceScoring, setSelfServiceScoring] = useState(false);
  // Step 6
  const [tiebreak, setTiebreak] = useState<PointsTiebreak>("points_scored");
  // Step 7
  const [aiTone, setAiTone] = useState<AiTone>("hype");
  // Quick-start template selection
  const [templateId, setTemplateId] = useState<string>("custom");

  const validPlayers = players.filter((p) => p.name.trim());

  /** Pre-fill the wizard from a one-click preset (everything stays editable). */
  function applyTemplate(t: Template) {
    setTemplateId(t.id);
    setScoringMode(t.scoringMode);
    setSeedingMethod(t.seedingMethod);
    setTiebreak(t.tiebreak);
    setFormat(t.format);
    if (t.config.roundRobinDouble != null)
      setRoundRobinDouble(t.config.roundRobinDouble);
    if (t.config.numGroups != null) setNumGroups(t.config.numGroups);
    if (t.config.advancePerGroup != null)
      setAdvancePerGroup(t.config.advancePerGroup);
    if (t.config.knockoutFormat) setKnockoutFormat(t.config.knockoutFormat);
    if (t.config.stages?.length) setStages(t.config.stages);
    // Multi-stage presets seed randomly (seeding rounds aren't used).
    if (t.format === "multi_stage" && t.seedingMethod === "seeding_rounds")
      setSeedingMethod("random");
    // Seed blank roster rows to the suggested size if nothing is entered yet.
    if (t.playerCount && players.every((p) => !p.name.trim())) {
      const count = Math.min(t.playerCount, MAX_PLAYERS);
      setPlayers(Array.from({ length: count }, () => newPlayer()));
    }
  }

  // Keep manual order in sync with the player list.
  const orderedIds = useMemo(() => {
    const ids = players.map((p) => p.id);
    const kept = manualOrder.filter((id) => ids.includes(id));
    const missing = ids.filter((id) => !kept.includes(id));
    return [...kept, ...missing];
  }, [manualOrder, players]);

  function updatePlayer(id: string, value: string) {
    setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, name: value } : p)));
  }
  function addPlayer() {
    if (players.length >= MAX_PLAYERS) return;
    setPlayers((ps) => [...ps, newPlayer()]);
  }
  function removePlayer(id: string) {
    setPlayers((ps) => (ps.length <= 2 ? ps : ps.filter((p) => p.id !== id)));
  }
  /** Merge a bulk-imported batch into the list, filling blank rows first. */
  function importNames(names: string[]) {
    setPlayers((ps) => {
      const filled = ps.filter((p) => p.name.trim());
      const merged = [...filled, ...names.map((n) => newPlayer(n))].slice(
        0,
        MAX_PLAYERS,
      );
      while (merged.length < 2) merged.push(newPlayer());
      return merged;
    });
  }

  function validateStep(): string | null {
    if (step === 0 && !name.trim()) return "Give your tournament a name.";
    if (step === 1) {
      if (validPlayers.length < 2) return "Add at least 2 players.";
      if (validPlayers.length > MAX_PLAYERS)
        return `Maximum ${MAX_PLAYERS} players.`;
      const names = validPlayers.map((p) => p.name.trim().toLowerCase());
      if (new Set(names).size !== names.length)
        return "Player names must be unique.";
    }
    if (step === 4 && format === "multi_stage") {
      if (seedingMethod === "seeding_rounds")
        return "Multi-stage uses random or manual seeding. Go back and pick one.";
      if (stages.length < 1) return "Add at least one stage.";
      const preview = stagePreview(validPlayers.length, stages);
      const bad = preview.find((p) => p.after < 1 || p.entrants < 2);
      if (bad)
        return `Stage ${bad.index + 1} leaves too few players. Adjust advancement.`;
    }
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  function submit() {
    setError(null);
    const idToIndex = new Map(
      validPlayers.map((p, i) => [p.id, i] as const),
    );

    const config: Record<string, unknown> = {};
    if (notes.trim()) config.notes = notes.trim().slice(0, 500);
    if (seedingMethod === "seeding_rounds")
      config.seedingRounds =
        seedingRounds === "full" ? "full" : Number(seedingRounds);
    if (format === "round_robin") config.roundRobinDouble = roundRobinDouble;
    if (format === "group_knockout") {
      config.numGroups = numGroups;
      config.advancePerGroup = advancePerGroup;
      config.groupDoubleRoundRobin = groupDouble;
      config.groupDraw = groupDraw;
      config.knockoutFormat = knockoutFormat;
    }
    if (format === "multi_stage") config.stages = stages;
    if (numStations > 1) config.numStations = numStations;
    if (seriesLength !== 1) config.seriesLength = seriesLength;
    if (selfServiceScoring) config.selfServiceScoring = true;

    const manualSeedOrderIndexes =
      seedingMethod === "manual"
        ? orderedIds
            .filter((id) => idToIndex.has(id))
            .map((id) => idToIndex.get(id)!)
        : undefined;

    const manualGroupIndexes =
      format === "group_knockout" && groupDraw === "manual"
        ? groupKeyList(numGroups).map((key) => ({
            groupKey: key,
            playerIndexes: validPlayers
              .filter((p) => (groupAssign[p.id] ?? groupKey(0)) === key)
              .map((p) => idToIndex.get(p.id)!),
          }))
        : undefined;

    startTransition(async () => {
      try {
        await createTournament({
          name,
          gameName,
          eventDate: eventDate || null,
          players: validPlayers.map((p) => ({ name: p.name.trim() })),
          format,
          scoringMode,
          seedingMethod,
          tiebreak,
          aiTone,
          config,
          manualSeedOrderIndexes,
          manualGroupIndexes,
        });
        // createTournament redirects on success.
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  return (
    <div>
      {/* Step indicator */}
      <ol className="mb-8 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              "flex items-center gap-1.5",
              i === step
                ? "text-primary"
                : i < step
                  ? "text-foreground"
                  : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "grid h-5 w-5 place-items-center rounded-full border text-[10px]",
                i === step
                  ? "border-primary bg-primary text-primary-foreground"
                  : i < step
                    ? "border-foreground"
                    : "border-border",
              )}
            >
              {i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      <div className="min-h-[320px]">
        {step === 0 && (
          <Step title="The basics" desc="Name your event and the game you're playing.">
            <div className="mb-6">
              <Label className="mb-2 block">Start from a template</Label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      templateId === t.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <span className="block text-sm font-semibold">{t.label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t.description}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Templates pre-fill format, scoring, seeding, and tiebreaker. You can
                change anything in the following steps.
              </p>
            </div>
            <Field label="Tournament name" htmlFor="name">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Friday Night Ping-Pong Classic"
                autoFocus
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Game / sport (optional)" htmlFor="game">
                <Input
                  id="game"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  placeholder="Table Tennis"
                />
              </Field>
              <Field label="Date (optional)" htmlFor="date">
                <Input
                  id="date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Notes / house rules (optional)" htmlFor="notes" className="mt-4">
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
                placeholder="House rule: re-racks on the break. Finals are best-of-3. BYOB."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-right text-xs text-muted-foreground">
                {notes.length}/500
              </p>
            </Field>
          </Step>
        )}

        {step === 1 && (
          <Step
            title="Players"
            desc={`Add 2–${MAX_PLAYERS} players. ${validPlayers.length} entered.`}
          >
            <div className="space-y-2">
              {players.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="w-6 text-right text-sm text-muted-foreground">
                    {i + 1}
                  </span>
                  <Input
                    value={p.name}
                    onChange={(e) => updatePlayer(p.id, e.target.value)}
                    placeholder={`Player ${i + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePlayer(p.id)}
                    disabled={players.length <= 2}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={addPlayer}
              disabled={players.length >= MAX_PLAYERS}
              className="mt-3"
            >
              <Plus /> Add player
            </Button>

            <div className="mt-4">
              <BulkImport
                existingCount={validPlayers.length}
                existingNames={validPlayers.map((p) => p.name.trim())}
                capacity={Math.max(0, MAX_PLAYERS - validPlayers.length)}
                onImport={importNames}
              />
            </div>
          </Step>
        )}

        {step === 2 && (
          <Step title="Scoring mode" desc="How are results recorded?">
            <ChoiceCards
              value={scoringMode}
              onChange={(v) => setScoringMode(v as ScoringMode)}
              options={(Object.keys(SCORING_LABELS) as ScoringMode[]).map(
                (k) => ({
                  value: k,
                  title: SCORING_LABELS[k],
                  desc:
                    k === "scored"
                      ? "Enter point totals; unlocks point differential and richer tiebreakers."
                      : "Just pick a winner each game. Draws allowed in round-robin play.",
                }),
              )}
            />
          </Step>
        )}

        {step === 3 && (
          <Step title="Seeding" desc="How should the bracket be seeded?">
            <ChoiceCards
              value={seedingMethod}
              onChange={(v) => setSeedingMethod(v as SeedingMethod)}
              options={(Object.keys(SEEDING_LABELS) as SeedingMethod[]).map(
                (k) => ({ value: k, title: SEEDING_LABELS[k] }),
              )}
            />
            {seedingMethod === "seeding_rounds" && (
              <Field label="How many seeding rounds?" className="mt-5">
                <Select value={seedingRounds} onValueChange={setSeedingRounds}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 round</SelectItem>
                    <SelectItem value="2">2 rounds</SelectItem>
                    <SelectItem value="3">3 rounds</SelectItem>
                    <SelectItem value="full">Full round robin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Players face different opponents each round; results decide the
                  seeds that feed your main format.
                </p>
              </Field>
            )}
            {seedingMethod === "manual" && (
              <div className="mt-5">
                <Label className="mb-2 block">Drag to rank (1 = top seed)</Label>
                <SortableList
                  ids={orderedIds.filter((id) =>
                    validPlayers.some((p) => p.id === id),
                  )}
                  onReorder={setManualOrder}
                  labelFor={(id, i) => {
                    const p = players.find((x) => x.id === id);
                    return (
                      <span className="flex flex-1 items-center gap-2">
                        <Badge variant="muted">#{i + 1}</Badge>
                        {p?.name || "Unnamed"}
                      </span>
                    );
                  }}
                />
              </div>
            )}
          </Step>
        )}

        {step === 4 && (
          <Step title="Format" desc="Pick the main format for the event.">
            <ChoiceCards
              value={format}
              onChange={(v) => setFormat(v as MainFormat)}
              options={(Object.keys(FORMAT_LABELS) as MainFormat[]).map((k) => ({
                value: k,
                title: FORMAT_LABELS[k],
                desc: FORMAT_BLURBS[k],
              }))}
            />

            {format === "round_robin" && (
              <Toggle
                className="mt-5"
                checked={roundRobinDouble}
                onChange={setRoundRobinDouble}
                label="Double round robin (everyone plays everyone twice)"
              />
            )}

            {format === "group_knockout" && (
              <div className="mt-5 space-y-4 rounded-lg border border-border p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Number of groups">
                    <Select
                      value={String(numGroups)}
                      onValueChange={(v) => setNumGroups(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          { length: Math.max(1, Math.floor(validPlayers.length / 2)) },
                          (_, i) => i + 2,
                        )
                          .filter((n) => n <= validPlayers.length)
                          .map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n} groups
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Advance per group">
                    <Select
                      value={String(advancePerGroup)}
                      onValueChange={(v) => setAdvancePerGroup(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">Top 1</SelectItem>
                        <SelectItem value="2">Top 2</SelectItem>
                        <SelectItem value="3">Top 3</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field label="Group draw">
                  <Select
                    value={groupDraw}
                    onValueChange={(v) =>
                      setGroupDraw(v as "random" | "manual")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="random">
                        Random (seed-balanced)
                      </SelectItem>
                      <SelectItem value="manual">Manual assignment</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {groupDraw === "manual" && (
                  <div className="space-y-2">
                    <Label>Assign each player to a group</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {validPlayers.map((p) => (
                        <div key={p.id} className="flex items-center gap-2">
                          <span className="flex-1 truncate text-sm">
                            {p.name}
                          </span>
                          <Select
                            value={groupAssign[p.id] ?? groupKey(0)}
                            onValueChange={(v) =>
                              setGroupAssign((g) => ({ ...g, [p.id]: v }))
                            }
                          >
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {groupKeyList(numGroups).map((k) => (
                                <SelectItem key={k} value={k}>
                                  Group {k}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <Toggle
                  checked={groupDouble}
                  onChange={setGroupDouble}
                  label="Double round robin within each group"
                />
                <Field label="Knockout format">
                  <Select
                    value={knockoutFormat}
                    onValueChange={(v) =>
                      setKnockoutFormat(
                        v as "single_elim" | "double_elim" | "triple_elim",
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single_elim">
                        Single elimination
                      </SelectItem>
                      <SelectItem value="double_elim">
                        Double elimination
                      </SelectItem>
                      <SelectItem value="triple_elim">
                        Triple elimination
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}

            {format === "multi_stage" && (
              <StagePipeline
                entrants={validPlayers.length}
                stages={stages}
                onChange={setStages}
              />
            )}

            <div className="mt-6 space-y-4 rounded-lg border border-border p-4">
              <p className="text-sm font-semibold">Match settings</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Parallel stations">
                  <Select
                    value={String(numStations)}
                    onValueChange={(v) => setNumStations(Number(v))}
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
                    value={String(seriesLength)}
                    onValueChange={(v) =>
                      setSeriesLength(Number(v) as 1 | 3 | 5)
                    }
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
              {seriesLength !== 1 ? (
                <p className="text-xs text-muted-foreground">
                  Best-of series apply to elimination matches. Round-robin and
                  group games stay single-game.
                </p>
              ) : null}
              <Toggle
                checked={selfServiceScoring}
                onChange={setSelfServiceScoring}
                label="Allow players to submit results for your approval"
              />
            </div>
          </Step>
        )}

        {step === 5 && (
          <Step
            title="Tiebreaker"
            desc="Head-to-head is always tried first. Then:"
          >
            <ChoiceCards
              value={tiebreak}
              onChange={(v) => setTiebreak(v as PointsTiebreak)}
              options={(Object.keys(TIEBREAK_LABELS) as PointsTiebreak[]).map(
                (k) => ({
                  value: k,
                  title: TIEBREAK_LABELS[k],
                  desc:
                    k === "points_scored"
                      ? "Reward offense — most total points wins the tie."
                      : "Reward defense — fewest points allowed wins the tie.",
                }),
              )}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Final fallback: point differential, then a clearly-flagged random
              tiebreak.
            </p>
          </Step>
        )}

        {step === 6 && (
          <Step title="AI preview tone" desc="How should matchup previews read?">
            <ChoiceCards
              value={aiTone}
              onChange={(v) => setAiTone(v as AiTone)}
              options={(Object.keys(TONE_LABELS) as AiTone[]).map((k) => ({
                value: k,
                title: TONE_LABELS[k],
              }))}
            />
          </Step>
        )}

        {step === 7 && (
          <Step title="Review & create" desc="Looks good? Start the show.">
            <dl className="grid gap-x-6 gap-y-3 rounded-lg border border-border p-5 text-sm sm:grid-cols-2">
              <Review label="Name" value={name} />
              <Review label="Game" value={gameName || "—"} />
              <Review label="Players" value={String(validPlayers.length)} />
              <Review label="Scoring" value={SCORING_LABELS[scoringMode]} />
              <Review label="Seeding" value={SEEDING_LABELS[seedingMethod]} />
              <Review label="Format" value={FORMAT_LABELS[format]} />
              <Review label="Tiebreaker" value={TIEBREAK_LABELS[tiebreak]} />
              <Review label="AI tone" value={TONE_LABELS[aiTone]} />
              {format === "single_elim" || format === "double_elim" ? (
                <Review
                  label="Bracket size"
                  value={`${nextPow2(validPlayers.length)} slots`}
                />
              ) : null}
              {format === "multi_stage" ? (
                <Review label="Stages" value={`${stages.length} stages`} />
              ) : null}
            </dl>
          </Step>
        )}
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={back} disabled={step === 0 || pending}>
          <ArrowLeft /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>
            Continue <ArrowRight />
          </Button>
        ) : (
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Create tournament
          </Button>
        )}
      </div>
    </div>
  );
}

function Step({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold">{title}</h2>
      {desc ? <p className="mt-1 text-sm text-muted-foreground">{desc}</p> : null}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function ChoiceCards({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; title: string; desc?: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg border p-4 text-left transition-colors",
            value === o.value
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold">{o.title}</span>
            <span
              className={cn(
                "h-4 w-4 rounded-full border",
                value === o.value
                  ? "border-primary bg-primary"
                  : "border-border",
              )}
            />
          </div>
          {o.desc ? (
            <p className="mt-1 text-xs text-muted-foreground">{o.desc}</p>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function Toggle({
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
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 text-sm",
        className,
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
      {label}
    </label>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

// --------------------------------------------------------------------------
// Multi-stage pipeline editor (Feature 8)
// --------------------------------------------------------------------------

const STAGE_KIND_OPTIONS: { value: StageKindName; label: string }[] = [
  { value: "group", label: "Group stage" },
  { value: "round_robin", label: "Round robin" },
  { value: "single_elim", label: "Single elimination" },
  { value: "double_elim", label: "Double elimination" },
  { value: "triple_elim", label: "Triple elimination" },
];

function stageKindOf(s: StageConfig): StageKindName {
  if (s.type === "knockout") return s.format;
  return s.type as StageKindName;
}

function comb2(n: number): number {
  return n < 2 ? 0 : (n * (n - 1)) / 2;
}

interface StagePreviewRow {
  index: number;
  kind: StageKindName;
  entrants: number;
  after: number;
  matches: number;
}

/** Pure live-preview of how the field narrows through the pipeline. */
function stagePreview(entrants: number, stages: StageConfig[]): StagePreviewRow[] {
  const rows: StagePreviewRow[] = [];
  let n = entrants;
  stages.forEach((s, index) => {
    const kind = stageKindOf(s);
    let after = 1;
    let matches = 0;
    if (s.type === "group") {
      const g = Math.max(1, s.numGroups);
      after = Math.min(n, g * Math.max(1, s.advancePerGroup));
      // Even split of n into g groups, summing intra-group round-robin matches.
      const base = Math.floor(n / g);
      const extra = n % g;
      for (let i = 0; i < g; i++) matches += comb2(base + (i < extra ? 1 : 0));
      if (s.doubleRoundRobin) matches *= 2;
    } else if (kind === "round_robin") {
      const double = s.type === "round_robin" ? s.double : false;
      matches = comb2(n) * (double ? 2 : 1);
      after = 1;
    } else if (kind === "single_elim") {
      matches = Math.max(0, nextPow2(n) - 1);
      after = 1;
    } else if (kind === "double_elim") {
      matches = Math.max(0, 2 * n - 1);
      after = 1;
    } else {
      matches = Math.max(0, 3 * (n - 1));
      after = 1;
    }
    rows.push({ index, kind, entrants: n, after, matches });
    n = after;
  });
  return rows;
}

function StagePipeline({
  entrants,
  stages,
  onChange,
}: {
  entrants: number;
  stages: StageConfig[];
  onChange: (s: StageConfig[]) => void;
}) {
  const preview = stagePreview(entrants, stages);

  function update(i: number, next: StageConfig) {
    onChange(stages.map((s, idx) => (idx === i ? next : s)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= stages.length) return;
    const copy = stages.slice();
    [copy[i], copy[j]] = [copy[j] as StageConfig, copy[i] as StageConfig];
    onChange(copy);
  }
  function remove(i: number) {
    if (stages.length <= 1) return;
    onChange(stages.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...stages, { type: "single_elim" }]);
  }
  function setKind(i: number, kind: StageKindName) {
    const next: StageConfig =
      kind === "group"
        ? { type: "group", numGroups: 4, advancePerGroup: 2, draw: "random" }
        : kind === "round_robin"
          ? { type: "round_robin", double: false }
          : { type: kind };
    update(i, next);
  }

  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm text-muted-foreground">
        Build a pipeline of stages. Each stage narrows the field; the last stage
        crowns the champion.
      </p>

      {/* Visual timeline */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
        <Badge variant="muted">{entrants} players</Badge>
        {preview.map((p) => (
          <span key={p.index} className="flex items-center gap-2">
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <Badge>
              {STAGE_KIND_OPTIONS.find((o) => o.value === p.kind)?.label} →{" "}
              {p.after}
            </Badge>
          </span>
        ))}
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <Badge variant="muted">🏆 Champion</Badge>
      </div>

      {stages.map((stage, i) => {
        const kind = stageKindOf(stage);
        const row = preview[i];
        const entersKnockout =
          (kind === "single_elim" ||
            kind === "double_elim" ||
            kind === "triple_elim") &&
          row !== undefined &&
          (row.entrants & (row.entrants - 1)) !== 0;
        return (
          <div
            key={i}
            className="space-y-3 rounded-lg border border-border p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">Stage {i + 1}</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => move(i, 1)}
                  disabled={i === stages.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(i)}
                  disabled={stages.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Field label="Stage type">
              <Select
                value={kind}
                onValueChange={(v) => setKind(i, v as StageKindName)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {stage.type === "group" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Number of groups">
                  <Input
                    type="number"
                    min={1}
                    value={stage.numGroups}
                    onChange={(e) =>
                      update(i, {
                        ...stage,
                        numGroups: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </Field>
                <Field label="Advance per group">
                  <Select
                    value={String(stage.advancePerGroup)}
                    onValueChange={(v) =>
                      update(i, { ...stage, advancePerGroup: Number(v) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Top 1</SelectItem>
                      <SelectItem value="2">Top 2</SelectItem>
                      <SelectItem value="3">Top 3</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Toggle
                    checked={Boolean(stage.doubleRoundRobin)}
                    onChange={(v) =>
                      update(i, { ...stage, doubleRoundRobin: v })
                    }
                    label="Double round robin within each group"
                  />
                </div>
              </div>
            )}

            {stage.type === "round_robin" && (
              <Toggle
                checked={Boolean(stage.double)}
                onChange={(v) => update(i, { ...stage, double: v })}
                label="Double round robin (everyone plays everyone twice)"
              />
            )}

            <p className="text-xs text-muted-foreground">
              {row?.entrants} enter → {row?.after} advance · ~{row?.matches}{" "}
              matches
              {entersKnockout
                ? ` · byes applied (padded to ${nextPow2(row!.entrants)})`
                : ""}
            </p>
          </div>
        );
      })}

      <Button type="button" variant="outline" onClick={add}>
        <Plus /> Add stage
      </Button>
    </div>
  );
}
