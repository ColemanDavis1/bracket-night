"use client";

import { useState, useTransition } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { enterResult, deleteResult } from "@/lib/actions/tournaments";
import type { ResolvedMatch, ScoringMode } from "@/lib/engine";
import type { NameMap } from "@/lib/hub-helpers";

export function ScoreEntryDialog({
  tournamentId,
  match,
  names,
  scoringMode,
  trigger,
}: {
  tournamentId: string;
  match: ResolvedMatch;
  names: NameMap;
  scoringMode: ScoringMode;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const aName = match.aId ? (names[match.aId] ?? "A") : "A";
  const bName = match.bId ? (names[match.bId] ?? "B") : "B";

  const [scoreA, setScoreA] = useState<string>(match.scoreA?.toString() ?? "");
  const [scoreB, setScoreB] = useState<string>(match.scoreB?.toString() ?? "");
  const [winner, setWinner] = useState<string | "draw" | null>(
    match.isDraw ? "draw" : match.winnerId,
  );

  const isEdit = match.status === "done";
  const canDraw = match.allowDraw;

  function submit() {
    setError(null);
    if (!match.aId || !match.bId) return;

    let winnerId: string | null = null;
    let isDraw = false;
    let sa: number | null = null;
    let sb: number | null = null;

    if (scoringMode === "scored") {
      sa = scoreA === "" ? null : Number(scoreA);
      sb = scoreB === "" ? null : Number(scoreB);
      if (sa == null || sb == null || Number.isNaN(sa) || Number.isNaN(sb)) {
        setError("Enter both scores.");
        return;
      }
      if (sa === sb) {
        if (!canDraw) {
          setError("This match can't end in a draw — scores must differ.");
          return;
        }
        isDraw = true;
      } else {
        winnerId = sa > sb ? match.aId : match.bId;
      }
    } else {
      if (winner === "draw") {
        if (!canDraw) {
          setError("This match can't end in a draw.");
          return;
        }
        isDraw = true;
      } else if (winner === match.aId || winner === match.bId) {
        winnerId = winner;
      } else {
        setError("Pick a winner.");
        return;
      }
    }

    startTransition(async () => {
      try {
        await enterResult({
          tournamentId,
          matchKey: match.key,
          winnerId,
          scoreA: sa,
          scoreB: sb,
          isDraw,
        });
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  }

  function clear() {
    startTransition(async () => {
      try {
        await deleteResult(tournamentId, match.key);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not clear.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit result" : "Enter result"}</DialogTitle>
          <DialogDescription>{match.label}</DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <div className="flex items-start gap-2 rounded-md border border-broadcast-gold/40 bg-broadcast-gold/10 px-3 py-2 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-broadcast-gold" />
            <span>
              Editing a completed result will recompute standings, rankings, and
              any downstream bracket matchups.
            </span>
          </div>
        ) : null}

        {scoringMode === "scored" ? (
          <div className="grid grid-cols-2 gap-4">
            <ScoreInput label={aName} value={scoreA} onChange={setScoreA} />
            <ScoreInput label={bName} value={scoreB} onChange={setScoreB} />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Who won?</p>
            <div className="grid gap-2">
              <WinnerButton
                label={aName}
                active={winner === match.aId}
                onClick={() => setWinner(match.aId)}
              />
              <WinnerButton
                label={bName}
                active={winner === match.bId}
                onClick={() => setWinner(match.bId)}
              />
              {canDraw ? (
                <WinnerButton
                  label="Draw"
                  active={winner === "draw"}
                  onClick={() => setWinner("draw")}
                />
              ) : null}
            </div>
          </div>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter className="gap-2">
          {isEdit ? (
            <Button variant="outline" onClick={clear} disabled={pending}>
              Clear result
            </Button>
          ) : null}
          <Button onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScoreInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block truncate text-sm font-medium">{label}</label>
      <Input
        inputMode="numeric"
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-14 text-center text-2xl font-extrabold tabular-nums"
      />
    </div>
  );
}

function WinnerButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-4 py-3 text-left font-semibold transition-colors",
        active
          ? "border-primary bg-primary/15"
          : "border-border hover:border-primary/50",
      )}
    >
      {label}
    </button>
  );
}
