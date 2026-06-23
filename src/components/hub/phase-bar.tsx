"use client";

import { CheckCircle2, Trophy, Users } from "lucide-react";
import type { EngineState } from "@/lib/engine";
import { phaseProgress, playersRemaining, stageDisplayLabel } from "@/lib/engine";

/**
 * Persistent event-phase bar shown below the ticker on every hub view. When a
 * phase has just finished it swaps to a broadcast-style transition banner.
 */
export function PhaseBar({ state }: { state: EngineState }) {
  if (state.matches.length === 0) return null;

  if (state.complete) {
    return (
      <div className="border-b border-broadcast-gold/40 bg-broadcast-gold/10">
        <div className="container flex items-center gap-2 py-2 text-sm font-bold text-broadcast-gold">
          <Trophy className="h-4 w-4" /> Tournament complete
        </div>
      </div>
    );
  }

  if (state.phaseTransition) {
    return (
      <div className="animate-in fade-in border-y-2 border-broadcast-gold bg-gradient-to-r from-broadcast-gold/20 via-broadcast-red/10 to-broadcast-gold/20">
        <div className="container flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-3 text-center">
          <CheckCircle2 className="h-5 w-5 text-broadcast-gold" />
          <span className="text-sm font-extrabold uppercase tracking-widest text-broadcast-gold sm:text-base">
            {state.phaseTransition.from} complete
          </span>
          <span className="text-sm font-bold uppercase tracking-widest text-foreground/80 sm:text-base">
            — {state.phaseTransition.to} begins next
          </span>
        </div>
      </div>
    );
  }

  const pp = phaseProgress(state);
  const remaining = playersRemaining(state);
  const pct = pp.total > 0 ? Math.round((pp.done / pp.total) * 100) : 0;
  const isMulti = state.stages !== null && state.stages.length > 0;
  const showStage = isMulti || state.activeStageIndex > 0;
  const stageLabel = isMulti
    ? `Stage ${state.activeStageIndex + 1} of ${state.stages!.length}`
    : `Stage ${state.activeStageIndex + 1}`;
  const phaseName =
    isMulti && state.stages![state.activeStageIndex]
      ? stageDisplayLabel(state.stages!, state.activeStageIndex)
      : pp.label;
  const showRounds = pp.roundCount > 1;

  return (
    <div className="border-b border-border bg-card/40">
      <div className="container flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs sm:text-sm">
        {showStage ? (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 font-bold uppercase tracking-wider text-primary">
            {stageLabel}
          </span>
        ) : null}
        <span className="font-bold">{phaseName}</span>
        {showRounds ? (
          <span className="text-muted-foreground">
            Round {pp.roundNumber} of {pp.roundCount}
          </span>
        ) : null}
        <span className="text-muted-foreground">
          {pp.done}/{pp.total} matches done
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {remaining} {remaining === 1 ? "player" : "players"} remaining
        </span>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
