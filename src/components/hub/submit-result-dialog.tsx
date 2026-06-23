"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
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
import { submitPendingResult } from "@/lib/actions/tournaments";
import type { ResolvedMatch, ScoringMode } from "@/lib/engine";
import type { NameMap } from "@/lib/hub-helpers";

/**
 * Public "submit result" form shown when self-service scoring is enabled
 * (Feature 15). The submission is queued for organizer approval; it does not
 * change the bracket until approved.
 */
export function SubmitResultDialog({
  tournamentId,
  match,
  names,
  scoringMode,
  alreadyPending = false,
}: {
  tournamentId: string;
  match: ResolvedMatch;
  names: NameMap;
  scoringMode: ScoringMode;
  alreadyPending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const aName = match.aId ? (names[match.aId] ?? "A") : "A";
  const bName = match.bId ? (names[match.bId] ?? "B") : "B";

  const [winner, setWinner] = useState<string | "draw" | null>(null);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [who, setWho] = useState("");

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
        if (!match.allowDraw) {
          setError("Scores must differ.");
          return;
        }
        isDraw = true;
      } else {
        winnerId = sa > sb ? match.aId : match.bId;
      }
    } else {
      if (winner === "draw") isDraw = true;
      else if (winner === match.aId || winner === match.bId) winnerId = winner;
      else {
        setError("Pick a winner.");
        return;
      }
    }

    startTransition(async () => {
      try {
        await submitPendingResult({
          tournamentId,
          matchKey: match.key,
          winnerId,
          scoreA: sa,
          scoreB: sb,
          isDraw,
          submittedBy: who,
        });
        setDone(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not submit.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setDone(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={alreadyPending}>
          <Send className="h-4 w-4" />
          {alreadyPending ? "Submitted" : "Submit result"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit result</DialogTitle>
          <DialogDescription>
            {match.label} — sent to the organizer for approval.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <p className="rounded-md border border-broadcast-green/40 bg-broadcast-green/10 px-3 py-2 text-sm text-broadcast-green">
            Thanks! Your result is awaiting organizer approval.
          </p>
        ) : (
          <>
            {scoringMode === "scored" ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block truncate text-sm font-medium">
                    {aName}
                  </label>
                  <Input
                    inputMode="numeric"
                    type="number"
                    value={scoreA}
                    onChange={(e) => setScoreA(e.target.value)}
                    className="h-14 text-center text-2xl font-extrabold tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block truncate text-sm font-medium">
                    {bName}
                  </label>
                  <Input
                    inputMode="numeric"
                    type="number"
                    value={scoreB}
                    onChange={(e) => setScoreB(e.target.value)}
                    className="h-14 text-center text-2xl font-extrabold tabular-nums"
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                {[
                  { id: match.aId, label: aName },
                  { id: match.bId, label: bName },
                ].map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setWinner(o.id)}
                    className={cn(
                      "rounded-lg border px-4 py-3 text-left font-semibold",
                      winner === o.id
                        ? "border-primary bg-primary/15"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    {o.label} won
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="who">
                Your name (optional)
              </label>
              <Input
                id="who"
                value={who}
                onChange={(e) => setWho(e.target.value)}
                placeholder="Who's submitting?"
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <Button onClick={submit} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Submit for approval
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
