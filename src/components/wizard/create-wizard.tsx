"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Plus, Trash2, Loader2 } from "lucide-react";
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
import { GROUP_KEYS, nextPow2 } from "@/lib/engine";
import type {
  AiTone,
  MainFormat,
  PointsTiebreak,
  ScoringMode,
  SeedingMethod,
} from "@/lib/engine";
import { createTournament } from "@/lib/actions/tournaments";
import { SortableList } from "./sortable-list";

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
  // Step 6
  const [tiebreak, setTiebreak] = useState<PointsTiebreak>("points_scored");
  // Step 7
  const [aiTone, setAiTone] = useState<AiTone>("hype");

  const validPlayers = players.filter((p) => p.name.trim());

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
    if (players.length >= 32) return;
    setPlayers((ps) => [...ps, newPlayer()]);
  }
  function removePlayer(id: string) {
    setPlayers((ps) => (ps.length <= 2 ? ps : ps.filter((p) => p.id !== id)));
  }

  function validateStep(): string | null {
    if (step === 0 && !name.trim()) return "Give your tournament a name.";
    if (step === 1) {
      if (validPlayers.length < 2) return "Add at least 2 players.";
      if (validPlayers.length > 32) return "Maximum 32 players.";
      const names = validPlayers.map((p) => p.name.trim().toLowerCase());
      if (new Set(names).size !== names.length)
        return "Player names must be unique.";
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

    const manualSeedOrderIndexes =
      seedingMethod === "manual"
        ? orderedIds
            .filter((id) => idToIndex.has(id))
            .map((id) => idToIndex.get(id)!)
        : undefined;

    const manualGroupIndexes =
      format === "group_knockout" && groupDraw === "manual"
        ? GROUP_KEYS.slice(0, numGroups).map((groupKey) => ({
            groupKey,
            playerIndexes: validPlayers
              .filter((p) => (groupAssign[p.id] ?? GROUP_KEYS[0]) === groupKey)
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
          </Step>
        )}

        {step === 1 && (
          <Step
            title="Players"
            desc={`Add 2–32 players. ${validPlayers.length} entered.`}
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
              disabled={players.length >= 32}
              className="mt-3"
            >
              <Plus /> Add player
            </Button>
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
                            value={groupAssign[p.id] ?? GROUP_KEYS[0]}
                            onValueChange={(v) =>
                              setGroupAssign((g) => ({ ...g, [p.id]: v }))
                            }
                          >
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {GROUP_KEYS.slice(0, numGroups).map((k) => (
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
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
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
