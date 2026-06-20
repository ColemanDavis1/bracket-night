import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ScoringMode, StandingsRow } from "@/lib/engine";
import { recordLine } from "@/lib/hub-helpers";

export function StandingsTable({
  rows,
  scoringMode,
  compact = false,
}: {
  rows: StandingsRow[];
  scoringMode: ScoringMode;
  compact?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No games played yet.
      </p>
    );
  }
  const showPoints = scoringMode === "scored";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2 text-left font-semibold">#</th>
            <th className="px-2 py-2 text-left font-semibold">Player</th>
            <th className="px-2 py-2 text-center font-semibold">W-L</th>
            {showPoints && !compact ? (
              <>
                <th className="px-2 py-2 text-center font-semibold">PF</th>
                <th className="px-2 py-2 text-center font-semibold">PA</th>
              </>
            ) : null}
            {showPoints ? (
              <th className="px-2 py-2 text-center font-semibold">Diff</th>
            ) : null}
            <th className="px-2 py-2 text-center font-semibold">Strk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.participantId}
              className={cn(
                "border-b border-border/50",
                r.rank === 1 && !r.withdrawn ? "bg-broadcast-gold/5" : "",
                r.withdrawn ? "opacity-50" : "",
              )}
            >
              <td className="px-2 py-2">
                <span
                  className={cn(
                    "scorenum",
                    r.rank === 1 && !r.withdrawn ? "text-broadcast-gold" : "",
                  )}
                >
                  {r.rank}
                </span>
              </td>
              <td className="px-2 py-2 font-medium">
                <span className="flex items-center gap-2">
                  {r.name}
                  {r.withdrawn ? (
                    <Badge variant="muted" className="text-[10px]">
                      OUT
                    </Badge>
                  ) : null}
                  {r.decidedByRandom ? (
                    <span
                      title="Position decided by random tiebreak"
                      className="text-[10px] text-muted-foreground"
                    >
                      🎲
                    </span>
                  ) : null}
                </span>
              </td>
              <td className="px-2 py-2 text-center tabular-nums">
                {recordLine(r)}
              </td>
              {showPoints && !compact ? (
                <>
                  <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">
                    {r.pointsFor}
                  </td>
                  <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">
                    {r.pointsAgainst}
                  </td>
                </>
              ) : null}
              {showPoints ? (
                <td className="px-2 py-2 text-center tabular-nums">
                  {r.pointDiff > 0 ? "+" : ""}
                  {r.pointDiff}
                </td>
              ) : null}
              <td className="px-2 py-2 text-center">
                {r.streak >= 2 ? (
                  <span className="inline-flex items-center gap-0.5 text-broadcast-red">
                    <Flame className="h-3.5 w-3.5" />
                    {r.streak}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
