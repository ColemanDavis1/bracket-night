import { ChevronUp, ChevronDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StandingsRow } from "@/lib/engine";
import { rankingMovement, recordLine, type NameMap } from "@/lib/hub-helpers";

export function PowerRankings({
  standings,
  current,
  previous,
  names,
}: {
  standings: StandingsRow[];
  current: string[];
  previous: string[];
  names: NameMap;
}) {
  const move = rankingMovement(current, previous);
  const byId = new Map(standings.map((r) => [r.participantId, r]));
  const order = current.length ? current : standings.map((r) => r.participantId);

  if (order.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Rankings appear once games are played.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {order.map((id, i) => {
        const row = byId.get(id);
        const delta = move.get(id) ?? 0;
        return (
          <li
            key={id}
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
          >
            <span className="scorenum w-8 text-center text-lg">{i + 1}</span>
            <Movement delta={delta} />
            <span className="flex-1 font-semibold">
              {names[id] ?? row?.name ?? "—"}
            </span>
            {row ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {recordLine(row)}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Movement({ delta }: { delta: number }) {
  if (delta > 0)
    return (
      <span
        className="inline-flex items-center text-broadcast-green"
        title={`Up ${delta}`}
      >
        <ChevronUp className="h-4 w-4" />
        <span className="text-xs font-bold">{delta}</span>
      </span>
    );
  if (delta < 0)
    return (
      <span
        className="inline-flex items-center text-broadcast-red"
        title={`Down ${-delta}`}
      >
        <ChevronDown className="h-4 w-4" />
        <span className="text-xs font-bold">{-delta}</span>
      </span>
    );
  return (
    <span className={cn("text-muted-foreground")} title="No change">
      <Minus className="h-4 w-4" />
    </span>
  );
}
