"use client";

import { useTransition } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { setPlayerWithdrawn } from "@/lib/actions/tournaments";
import type { HubPlayer } from "./types";

export function PlayersAdmin({
  tournamentId,
  players,
}: {
  tournamentId: string;
  players: HubPlayer[];
}) {
  const [pending, startTransition] = useTransition();

  function toggle(id: string, withdrawn: boolean) {
    startTransition(async () => {
      await setPlayerWithdrawn(tournamentId, id, withdrawn);
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Mark a player withdrawn to forfeit their remaining matches. Standings and
        the bracket recompute automatically.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {players.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-3 py-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              {p.name}
              {p.withdrawn ? <Badge variant="muted">Withdrawn</Badge> : null}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => toggle(p.id, !p.withdrawn)}
            >
              {p.withdrawn ? (
                <>
                  <UserPlus className="h-4 w-4" /> Reinstate
                </>
              ) : (
                <>
                  <UserMinus className="h-4 w-4" /> Withdraw
                </>
              )}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
