"use client";

import { useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EngineState, ScoringMode } from "@/lib/engine";
import { currentRound, roundsOf } from "@/lib/engine";
import type { NameMap } from "@/lib/hub-helpers";
import { MatchRow } from "./match-row";

export function Schedule({
  state,
  names,
  scoringMode,
  tournamentId,
  isOrganizer,
  seriesLength = 1,
}: {
  state: EngineState;
  names: NameMap;
  scoringMode: ScoringMode;
  tournamentId: string;
  isOrganizer: boolean;
  seriesLength?: 1 | 3 | 5;
}) {
  const activeRef = useRef<HTMLDivElement>(null);
  const rounds = roundsOf(state);
  const active = currentRound(state);

  // Auto-scroll to the active round on load and whenever it changes.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active?.key]);

  if (rounds.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        The schedule will appear here once the draw is set.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rounds.map((g) => {
        const isActive = g.key === active?.key;
        return (
          <section
            key={g.key}
            ref={isActive ? activeRef : undefined}
            className={cn(
              "rounded-xl border",
              isActive
                ? "border-primary/50 bg-primary/5"
                : "border-border bg-card/40",
            )}
          >
            <details open={isActive || !g.complete}>
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5">
                <span className="flex items-center gap-2">
                  <h3
                    className={cn(
                      "text-xs font-bold uppercase tracking-widest",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {g.label}
                  </h3>
                  {isActive ? (
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                      Now
                    </span>
                  ) : null}
                  {g.complete ? (
                    <CheckCircle2 className="h-4 w-4 text-broadcast-green" />
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground">
                  {g.done}/{g.total}
                </span>
              </summary>
              <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
                {g.matches.map((m) => (
                  <MatchRow
                    key={m.key}
                    match={m}
                    names={names}
                    scoringMode={scoringMode}
                    tournamentId={tournamentId}
                    isOrganizer={isOrganizer}
                    seriesLength={seriesLength}
                  />
                ))}
              </div>
            </details>
          </section>
        );
      })}
    </div>
  );
}
