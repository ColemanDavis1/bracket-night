"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Plus, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { addPlayer, setPlayerWithdrawn } from "@/lib/actions/tournaments";
import { MAX_PLAYERS } from "@/lib/constants";
import type { HubPlayer } from "./types";

export function PlayersAdmin({
  tournamentId,
  players,
}: {
  tournamentId: string;
  players: HubPlayer[];
}) {
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const atCap = players.length >= MAX_PLAYERS;

  function toggle(id: string, withdrawn: boolean) {
    startTransition(async () => {
      await setPlayerWithdrawn(tournamentId, id, withdrawn);
    });
  }

  function add() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      try {
        await addPlayer(tournamentId, name);
        setNewName("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add player.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Mark a player withdrawn to forfeit their remaining matches. Standings and
        the bracket recompute automatically.
      </p>

      <div className="rounded-lg border border-border p-3">
        <label className="text-sm font-medium" htmlFor="add-player">
          Add a late-arriving player
        </label>
        <div className="mt-2 flex gap-2">
          <Input
            id="add-player"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Player name"
            disabled={pending || atCap}
          />
          <Button onClick={add} disabled={pending || atCap || !newName.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-broadcast-gold" />
          Adding a player mid-event re-draws the bracket from the expanded pool.
          Played results are kept, but you may need to adjust pairings manually.
        </p>
        {atCap ? (
          <p className="mt-1 text-xs text-destructive">
            Roster is at the {MAX_PLAYERS}-player cap.
          </p>
        ) : null}
        {error ? (
          <p className="mt-1 text-xs text-destructive">{error}</p>
        ) : null}
      </div>

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
