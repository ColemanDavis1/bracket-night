import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ResolvedMatch, ScoringMode } from "@/lib/engine";
import { matchupName, type NameMap } from "@/lib/hub-helpers";
import { ScoreEntryDialog } from "./score-entry-dialog";

export function MatchRow({
  match,
  names,
  scoringMode,
  tournamentId,
  isOrganizer,
}: {
  match: ResolvedMatch;
  names: NameMap;
  scoringMode: ScoringMode;
  tournamentId: string;
  isOrganizer: boolean;
}) {
  const { a, b } = matchupName(match, names);
  const done = match.status === "done";
  const isBye = match.status === "bye";
  const aWon = done && match.winnerId === match.aId;
  const bWon = done && match.winnerId === match.bId;

  if (isBye && !match.forfeit) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-card/50 px-3 py-2 text-sm">
        <span className="font-medium">{a !== "BYE" ? a : b}</span>
        <Badge variant="muted">Bye</Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <Side
          name={a}
          score={match.scoreA}
          won={aWon}
          showScore={done && scoringMode === "scored"}
        />
        <div className="my-0.5 h-px bg-border/50" />
        <Side
          name={b}
          score={match.scoreB}
          won={bWon}
          showScore={done && scoringMode === "scored"}
        />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {match.forfeit ? (
          <Badge variant="muted" className="text-[10px]">
            Forfeit
          </Badge>
        ) : match.isDraw ? (
          <Badge variant="secondary" className="text-[10px]">
            Draw
          </Badge>
        ) : null}
        {isOrganizer && (match.status === "ready" || done) ? (
          <ScoreEntryDialog
            tournamentId={tournamentId}
            match={match}
            names={names}
            scoringMode={scoringMode}
            trigger={
              <Button
                size="sm"
                variant={done ? "ghost" : "default"}
                className="h-7 px-2 text-xs"
              >
                {done ? <Pencil className="h-3 w-3" /> : "Enter"}
              </Button>
            }
          />
        ) : !done && !isOrganizer ? (
          <Badge variant="muted" className="text-[10px]">
            {match.status === "ready" ? "Up next" : "Pending"}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function Side({
  name,
  score,
  won,
  showScore,
}: {
  name: string;
  score: number | null;
  won: boolean;
  showScore: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={cn(
          "truncate text-sm",
          won ? "font-bold" : "font-medium text-muted-foreground",
        )}
      >
        {won ? "▸ " : ""}
        {name}
      </span>
      {showScore ? (
        <span
          className={cn("scorenum text-sm", won ? "text-foreground" : "text-muted-foreground")}
        >
          {score ?? "—"}
        </span>
      ) : null}
    </div>
  );
}
