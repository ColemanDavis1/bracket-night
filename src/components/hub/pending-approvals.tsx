"use client";

import { useTransition } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  approvePendingResult,
  rejectPendingResult,
} from "@/lib/actions/tournaments";
import type { EngineState, ScoringMode } from "@/lib/engine";
import type { NameMap } from "@/lib/hub-helpers";
import type { HubPending } from "./types";

/**
 * Organizer view of player-submitted results awaiting approval (Feature 15).
 * Approve writes the real result and recomputes; reject discards it.
 */
export function PendingApprovals({
  pending,
  state,
  names,
  scoringMode,
}: {
  pending: HubPending[];
  state: EngineState;
  names: NameMap;
  scoringMode: ScoringMode;
}) {
  const [busy, startTransition] = useTransition();
  const labelByKey = new Map(state.matches.map((m) => [m.key, m.label]));

  function approve(id: string) {
    startTransition(async () => {
      await approvePendingResult(id);
    });
  }
  function reject(id: string) {
    startTransition(async () => {
      await rejectPendingResult(id);
    });
  }

  if (pending.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No submissions are waiting for approval.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Players submitted these results. Approving writes the score and
        recomputes standings.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {pending.map((p) => {
          const w = p.winnerId ? (names[p.winnerId] ?? "—") : null;
          return (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {labelByKey.get(p.matchKey) ?? p.matchKey}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.isDraw
                    ? "Reported a draw"
                    : `Winner: ${w}`}
                  {scoringMode === "scored" && p.scoreA != null && p.scoreB != null
                    ? ` · ${p.scoreA}–${p.scoreB}`
                    : ""}
                  {p.submittedBy ? ` · by ${p.submittedBy}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => reject(p.id)}
              >
                <X className="h-4 w-4" /> Reject
              </Button>
              <Button size="sm" disabled={busy} onClick={() => approve(p.id)}>
                <Check className="h-4 w-4" /> Approve
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
